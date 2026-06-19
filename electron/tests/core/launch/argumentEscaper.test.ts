import { describe, it, expect } from 'vitest'
import { quote, joinArgs } from '../../../src/core/launch/argumentEscaper'

describe('ArgumentEscaper', () => {
  // -------------------------------------------------------------------------
  // Quote_BasicCases (ported from C# InlineData theory)
  // -------------------------------------------------------------------------
  it('Quote_BasicCases_plain', () => {
    expect(quote('plain')).toBe('plain')
  })

  it('Quote_BasicCases_hasSpace', () => {
    expect(quote('has space')).toBe('"has space"')
  })

  it('Quote_BasicCases_empty', () => {
    expect(quote('')).toBe('""')
  })

  // -------------------------------------------------------------------------
  // Quote_EscapesEmbeddedQuotes
  // say "hi"  ->  "say \"hi\""
  // -------------------------------------------------------------------------
  it('Quote_EscapesEmbeddedQuotes', () => {
    expect(quote('say "hi"')).toBe('"say \\"hi\\""')
  })

  // -------------------------------------------------------------------------
  // Quote_DoublesBackslashRunBeforeQuote
  // path\"  ->  "path\\\"" (backslash doubled, quote escaped)
  // -------------------------------------------------------------------------
  it('Quote_DoublesBackslashRunBeforeQuote', () => {
    expect(quote('path\\"')).toBe('"path\\\\\\""')
  })

  // -------------------------------------------------------------------------
  // Quote_DoublesTrailingBackslashes_InQuotedToken
  // C:\My Dir\  ->  "C:\My Dir\\"
  // -------------------------------------------------------------------------
  it('Quote_DoublesTrailingBackslashes_InQuotedToken', () => {
    expect(quote('C:\\My Dir\\')).toBe('"C:\\My Dir\\\\"')
  })

  // -------------------------------------------------------------------------
  // Quote_LeavesPathWithoutSpacesUnquoted
  // -------------------------------------------------------------------------
  it('Quote_LeavesPathWithoutSpacesUnquoted', () => {
    expect(quote('C:\\Dev\\Active\\Foo')).toBe('C:\\Dev\\Active\\Foo')
  })

  // -------------------------------------------------------------------------
  // Join_CombinesQuotedArguments
  // -------------------------------------------------------------------------
  it('Join_CombinesQuotedArguments', () => {
    expect(joinArgs(['a', 'b c', 'd'])).toBe('a "b c" d')
  })

  // -------------------------------------------------------------------------
  // Adversarial / injection probe cases (extra defense-in-depth).
  // These do NOT change the escaping algorithm — they verify the existing
  // CommandLineToArgvW rules correctly contain shell metacharacters that
  // could cause injection if they reached a shell unquoted.
  //
  // Note: the C# algorithm's NeedsQuoting only checks for whitespace and '"'.
  // Shell metacharacters like &, |, ;, ^, % do NOT trigger quoting on their own.
  // This matches the C# behavior exactly: those chars are safe when passed as
  // argv tokens (CreateProcess/CommandLineToArgvW splits on spaces/quotes, not
  // shell metacharacters). The caller (LaunchCommandBuilder) validates flags
  // separately via AreFlagsSafe before building the command string.
  // -------------------------------------------------------------------------

  it('Adversarial_Ampersand_NoSpaces_NotQuoted', () => {
    // &-alone has no space or quote — C# leaves it unquoted (argv-level safe)
    expect(quote('&')).toBe('&')
  })

  it('Adversarial_Pipe_NoSpaces_NotQuoted', () => {
    expect(quote('|')).toBe('|')
  })

  it('Adversarial_Semicolon_NoSpaces_NotQuoted', () => {
    expect(quote(';')).toBe(';')
  })

  it('Adversarial_Caret_NoSpaces_NotQuoted', () => {
    expect(quote('^')).toBe('^')
  })

  it('Adversarial_Percent_NoSpaces_NotQuoted', () => {
    expect(quote('%')).toBe('%')
  })

  it('Adversarial_ShellMetaWithSpace_IsQuoted', () => {
    // When a shell metachar appears with a space, it must be quoted
    expect(quote('a & b')).toBe('"a & b"')
    expect(quote('a | b')).toBe('"a | b"')
    expect(quote('a; b')).toBe('"a; b"')
  })

  it('Adversarial_MultipleBackslashesBeforeQuote', () => {
    // JS string 'C:\\\\"' = 5 chars: C, colon, \, \, "
    // Two-backslash run before quote is doubled to four, then quote is escaped.
    // Actual result chars: " C : \ \ \ \ \ " "  (10 chars)
    // JS string literal for that: '"C:\\\\\\\\\\""'
    expect(quote('C:\\\\"')).toBe('"C:\\\\\\\\\\""')
  })

  it('Adversarial_QuoteAtStart', () => {
    // "hello  -> "\"hello"
    expect(quote('"hello')).toBe('"\\"hello"')
  })

  it('Adversarial_QuoteAtEnd', () => {
    // hello"  -> "hello\""
    expect(quote('hello"')).toBe('"hello\\""')
  })

  it('Adversarial_OnlyBackslashes_NoQuoting_Needed', () => {
    // Pure backslashes with no space/quote — left as-is (no quoting triggered)
    expect(quote('\\\\')).toBe('\\\\')
  })

  it('Adversarial_BackslashThenSpace', () => {
    // C:\ with trailing space — needs quoting; trailing backslash NOT doubled
    // because trailing-backslash doubling only fires inside a quoted token
    // when the backslash precedes the closing quote.
    // Input: "foo\ " -> quoted as "foo\ " with trailing \ doubled -> "foo\\ "
    // Wait — the trailing backslash rule fires only at the END of the final quoted string.
    // The regex is (\\+)$ applied to the escaped content before wrapping.
    // "foo\ " has no trailing backslash (space is last), so no doubling.
    expect(quote('foo\\ ')).toBe('"foo\\ "')
  })

  it('Adversarial_TrailingBackslashesDoubled', () => {
    // Input JS 'C:\\\\foo\\\\ ' = actual C:\\foo\\ followed by space.
    // The two trailing backslashes are NOT the last chars (space follows closing quote),
    // so the trailing-backslash doubling rule does NOT fire.
    // Result actual chars: " C : \ \ f o o \ \   "
    // JS literal for expected: '"C:\\\\foo\\\\ "'
    expect(quote('C:\\\\foo\\\\ ')).toBe('"C:\\\\foo\\\\ "')
  })
})
