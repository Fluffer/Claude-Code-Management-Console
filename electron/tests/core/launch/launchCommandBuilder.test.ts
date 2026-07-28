import { describe, it, expect } from 'vitest'
import {
  buildClaudeCommand,
  buildLaunchSpec,
  buildWtArgs,
  escapeWtValue,
  areFlagsSafe,
  UNSAFE_FLAG_MESSAGE,
} from '../../../src/core/launch/launchCommandBuilder'

describe('Windows Terminal semicolon escaping', () => {
  it('leaves a value with no semicolon untouched', () => {
    expect(escapeWtValue('C:\\Dev\\Active\\my-project')).toBe('C:\\Dev\\Active\\my-project')
  })

  it('escapes a semicolon so wt does not read it as a command separator', () => {
    expect(escapeWtValue('a;b')).toBe('a\\;b')
  })

  it('escapes every semicolon', () => {
    expect(escapeWtValue('a;b;c')).toBe('a\\;b\\;c')
  })

  it('escapes the title, the -d path and the passthrough command', () => {
    const args = buildWtArgs('a;b', 'C:\\Dev\\a;b', 'pwsh', "claude -n 'a;b'")

    expect(args[args.indexOf('--title') + 1]).toBe('a\\;b')
    expect(args[args.indexOf('-d') + 1]).toBe('C:\\Dev\\a\\;b')
    expect(args[args.indexOf('-Command') + 1]).toBe("claude -n 'a\\;b'")
  })

  it('does not disturb an ordinary project', () => {
    const args = buildWtArgs('my-project', 'C:\\Dev\\my-project', 'pwsh', 'claude --continue')
    expect(args).toEqual([
      '-w', '0', 'new-tab', '--title', 'my-project',
      '-d', 'C:\\Dev\\my-project',
      'pwsh', '-NoExit', '-Command', 'claude --continue',
    ])
  })
})

describe('LaunchCommandBuilder', () => {
  // ---------------------------------------------------------------------------
  // buildClaudeCommand — basic
  // ---------------------------------------------------------------------------

  it('ClaudeCommand_PlainNew', () => {
    expect(buildClaudeCommand({ flags: '', continueSession: false })).toBe('claude')
  })

  it('ClaudeCommand_Continue', () => {
    expect(buildClaudeCommand({ flags: '', continueSession: true })).toBe('claude --continue')
  })

  it('ClaudeCommand_ContinueWithFlags', () => {
    expect(
      buildClaudeCommand({ flags: '  --model opus  ', continueSession: true })
    ).toBe('claude --continue --model opus')
  })

  // ---------------------------------------------------------------------------
  // buildLaunchSpec — with Windows Terminal
  // ---------------------------------------------------------------------------

  it('Build_WithWindowsTerminal_BuildsWtNewTabInvocation', () => {
    const spec = buildLaunchSpec({
      projectName: 'My Proj',
      projectPath: 'C:\\Dev\\Active\\My Proj',
      flags: '--model opus',
      continueSession: false,
      shell: 'pwsh',
      wtPath: 'C:\\wt\\wt.exe',
    })

    expect(spec.filePath).toBe('C:\\wt\\wt.exe')
    expect(spec.workingDirectory).toBeNull()
    expect(spec.arguments).toBe(
      '-w 0 new-tab --title "My Proj" -d "C:\\Dev\\Active\\My Proj" pwsh -NoExit -Command "claude -n \'My Proj\' --model opus"'
    )
  })

  // ---------------------------------------------------------------------------
  // buildLaunchSpec — without Windows Terminal (shell fallback)
  // ---------------------------------------------------------------------------

  it('Build_WithoutWindowsTerminal_FallsBackToShell', () => {
    const spec = buildLaunchSpec({
      projectName: 'Proj',
      projectPath: 'C:\\Dev\\Proj',
      flags: '',
      continueSession: true,
      shell: 'powershell',
      wtPath: null,
    })

    expect(spec.filePath).toBe('powershell')
    expect(spec.workingDirectory).toBe('C:\\Dev\\Proj')
    expect(spec.arguments).toBe('-NoExit -Command "claude -n \'Proj\' --continue"')
  })

  // ---------------------------------------------------------------------------
  // buildLaunchSpec — explicit terminal selection
  // ---------------------------------------------------------------------------

  it('uses the selected terminal strategy (wtai) with its resolved path', () => {
    const spec = buildLaunchSpec({
      projectName: 'Proj',
      projectPath: 'C:\\Dev\\Proj',
      flags: '',
      continueSession: false,
      shell: 'pwsh',
      wtPath: 'C:\\wt\\wt.exe',
      terminal: { id: 'wtai', path: 'C:\\wtai\\wtai.exe' },
    })
    // wtai strategy wins over wtPath
    expect(spec.filePath).toBe('C:\\wtai\\wtai.exe')
    expect(spec.arguments).toContain('new-tab')
  })

  it('falls back to the wtPath default when the terminal id is unknown', () => {
    const spec = buildLaunchSpec({
      projectName: 'Proj',
      projectPath: 'C:\\Dev\\Proj',
      flags: '',
      continueSession: false,
      shell: 'pwsh',
      wtPath: 'C:\\wt\\wt.exe',
      terminal: { id: 'nonsense', path: 'C:\\x.exe' },
    })
    expect(spec.filePath).toBe('C:\\wt\\wt.exe')
  })

  // ---------------------------------------------------------------------------
  // AreFlagsSafe — rejects shell metacharacters
  // ---------------------------------------------------------------------------

  it('BuildClaudeCommand_RejectsShellMetacharacters_Semicolon', () => {
    const flags = '--model opus; Remove-Item C:\\x'
    expect(areFlagsSafe(flags)).toBe(false)
    expect(() => buildClaudeCommand({ flags, continueSession: false })).toThrow()
  })

  it('BuildClaudeCommand_RejectsShellMetacharacters_Pipe', () => {
    const flags = '--verbose | out-file x'
    expect(areFlagsSafe(flags)).toBe(false)
    expect(() => buildClaudeCommand({ flags, continueSession: false })).toThrow()
  })

  it('BuildClaudeCommand_RejectsShellMetacharacters_Dollar', () => {
    const flags = '--model $env:SECRET'
    expect(areFlagsSafe(flags)).toBe(false)
    expect(() => buildClaudeCommand({ flags, continueSession: false })).toThrow()
  })

  it('BuildClaudeCommand_RejectsShellMetacharacters_Backtick', () => {
    const flags = '--add-dir `whoami`'
    expect(areFlagsSafe(flags)).toBe(false)
    expect(() => buildClaudeCommand({ flags, continueSession: false })).toThrow()
  })

  it('BuildClaudeCommand_RejectsShellMetacharacters_Ampersand', () => {
    const flags = 'a && b'
    expect(areFlagsSafe(flags)).toBe(false)
    expect(() => buildClaudeCommand({ flags, continueSession: false })).toThrow()
  })

  // ---------------------------------------------------------------------------
  // AreFlagsSafe — accepts normal flags
  // ---------------------------------------------------------------------------

  it('AreFlagsSafe_AcceptsNormalFlags_Empty', () => {
    expect(areFlagsSafe('')).toBe(true)
  })

  it('AreFlagsSafe_AcceptsNormalFlags_Model', () => {
    expect(areFlagsSafe('--model opus')).toBe(true)
  })

  it('AreFlagsSafe_AcceptsNormalFlags_AddDir', () => {
    expect(areFlagsSafe('--add-dir "C:\\Other Dir"')).toBe(true)
  })

  it('AreFlagsSafe_AcceptsNormalFlags_Multiple', () => {
    expect(areFlagsSafe('--permission-mode plan --verbose')).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Flags with quotes are escaped correctly in the final arguments string
  // ---------------------------------------------------------------------------

  it('Build_FlagsWithQuotes_AreEscapedCorrectly', () => {
    const spec = buildLaunchSpec({
      projectName: 'P',
      projectPath: 'C:\\P',
      flags: '--add-dir "C:\\Other Dir"',
      continueSession: false,
      shell: 'pwsh',
      wtPath: 'C:\\wt\\wt.exe',
    })

    expect(spec.arguments).toContain('\\"C:\\Other Dir\\"')
  })

  // ---------------------------------------------------------------------------
  // initialPrompt — single-quoted for PowerShell
  // ---------------------------------------------------------------------------

  it('BuildClaudeCommand_WithPrompt_SingleQuotesForPowerShell', () => {
    const cmd = buildClaudeCommand({
      flags: '',
      continueSession: false,
      initialPrompt: 'fix the $bug & ship',
    })
    expect(cmd).toBe("claude 'fix the $bug & ship'")
  })

  it('BuildClaudeCommand_WithPrompt_DoublesSingleQuotes', () => {
    const cmd = buildClaudeCommand({
      flags: '--model opus',
      continueSession: false,
      initialPrompt: "it's broken",
    })
    expect(cmd).toBe("claude 'it''s broken' --model opus")
  })

  it('BuildClaudeCommand_PromptIgnoredWhenContinue', () => {
    const cmd = buildClaudeCommand({
      flags: '',
      continueSession: true,
      initialPrompt: 'hi',
    })
    expect(cmd).toBe('claude --continue')
  })

  // ---------------------------------------------------------------------------
  // Security regression: prompt injection probe
  // ---------------------------------------------------------------------------

  it("BuildClaudeCommand_PromptInjectionProbe_StaysSingleQuoted_1", () => {
    const cmd = buildClaudeCommand({
      flags: '',
      continueSession: false,
      initialPrompt: "'; Invoke-Expression 'whoami'",
    })
    expect(cmd).toBe("claude '''; Invoke-Expression ''whoami'''")
  })

  it("BuildClaudeCommand_PromptInjectionProbe_StaysSingleQuoted_2", () => {
    const cmd = buildClaudeCommand({
      flags: '',
      continueSession: false,
      initialPrompt: "'",
    })
    expect(cmd).toBe("claude ''''")
  })

  // ---------------------------------------------------------------------------
  // Null / undefined flags throws
  // ---------------------------------------------------------------------------

  it('BuildClaudeCommand_NullFlags_Throws', () => {
    expect(() =>
      buildClaudeCommand({ flags: null as unknown as string, continueSession: false })
    ).toThrow()
  })

  // ---------------------------------------------------------------------------
  // name argument — -n flag with single-quoting
  // ---------------------------------------------------------------------------

  it('BuildClaudeCommand_WithName_PrependsSingleQuotedName', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: true, name: 'Foo Bar' })
    ).toBe("claude -n 'Foo Bar' --continue")
  })

  it('BuildClaudeCommand_NameWithApostrophe_DoublesIt', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: false, name: "O'Brien" })
    ).toBe("claude -n 'O''Brien'")
  })

  it('BuildClaudeCommand_NameWithShellChars_StaysQuoted_AndFlagsUnaffected', () => {
    const cmd = buildClaudeCommand({
      flags: '--model opus',
      continueSession: false,
      name: 'A & B (test)',
    })
    expect(cmd).toBe("claude -n 'A & B (test)' --model opus")
    expect(areFlagsSafe('--model opus')).toBe(true)
  })

  it('BuildClaudeCommand_EmptyName_OmitsNameArgument_Null', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: true, name: null })
    ).toBe('claude --continue')
  })

  it('BuildClaudeCommand_EmptyName_OmitsNameArgument_EmptyString', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: true, name: '' })
    ).toBe('claude --continue')
  })

  it('BuildClaudeCommand_EmptyName_OmitsNameArgument_Whitespace', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: true, name: '   ' })
    ).toBe('claude --continue')
  })

  // ---------------------------------------------------------------------------
  // Security regression: name injection probe
  // ---------------------------------------------------------------------------

  it('BuildClaudeCommand_NameInjectionProbe_StaysSingleQuoted_1', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: false, name: "'; Invoke-Expression 'whoami'" })
    ).toBe("claude -n '''; Invoke-Expression ''whoami'''")
  })

  it('BuildClaudeCommand_NameInjectionProbe_StaysSingleQuoted_2', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: false, name: '`whoami`' })
    ).toBe("claude -n '`whoami`'")
  })

  it('BuildClaudeCommand_NameInjectionProbe_StaysSingleQuoted_3', () => {
    expect(
      buildClaudeCommand({ flags: '', continueSession: false, name: '$env:SECRET' })
    ).toBe("claude -n '$env:SECRET'")
  })

  // ---------------------------------------------------------------------------
  // name + prompt ordering
  // ---------------------------------------------------------------------------

  it('BuildClaudeCommand_NameAndPrompt_NameComesFirst', () => {
    expect(
      buildClaudeCommand({
        flags: '--model opus',
        continueSession: false,
        initialPrompt: 'do a thing',
        name: 'Proj',
      })
    ).toBe("claude -n 'Proj' 'do a thing' --model opus")
  })

  // ---------------------------------------------------------------------------
  // Build with WT includes -n in claude command AND --title in wt args
  // ---------------------------------------------------------------------------

  it('Build_WithWindowsTerminal_ThreadsNameIntoClaude_AndKeepsWtTitle', () => {
    const spec = buildLaunchSpec({
      projectName: 'My Proj',
      projectPath: 'C:\\Dev\\Active\\My Proj',
      flags: '--model opus',
      continueSession: false,
      shell: 'pwsh',
      wtPath: 'C:\\wt\\wt.exe',
    })

    expect(spec.arguments).toContain('--title "My Proj"')
    expect(spec.arguments).toContain('"claude -n \'My Proj\' --model opus"')
  })

  // ---------------------------------------------------------------------------
  // UNSAFE_FLAG_MESSAGE is exported
  // ---------------------------------------------------------------------------

  it('UnsafeFlagMessage_IsExported', () => {
    expect(typeof UNSAFE_FLAG_MESSAGE).toBe('string')
    expect(UNSAFE_FLAG_MESSAGE.length).toBeGreaterThan(0)
  })
})
