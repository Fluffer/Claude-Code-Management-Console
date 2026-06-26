import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { IProcessInspector } from './processInspector'
import type { ProcEntry } from '../../core/os/processOutputParser'
import type { RunningSession } from '../../core/models'
import { parseTasklistCsv, parseWmicProcessOutput, filterClaudeSessions } from '../../core/os/processOutputParser'

const execFileAsync = promisify(execFile)

/**
 * Enumerates candidate Claude host processes (claude/node/bun) AND reads each
 * one's real working directory by walking PEB -> RTL_USER_PROCESS_PARAMETERS via
 * NtQueryInformationProcess + ReadProcessMemory. Windows CIM/Win32_Process does
 * NOT expose a process working directory, so without this the live badge can
 * never map a session to its project (ported from the C# ProcessInspector).
 *
 * The inline C# is compiled once per invocation via Add-Type. If compilation or
 * any per-process read fails (access denied, process exited), the row is still
 * emitted with an empty WorkingDirectory so name-based matching can still work.
 * x64-host-reading-x64-target only — offsets are the stable x64 PEB layout.
 */
const PEB_INSPECT_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CcmcProc {
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h,int c,byte[] pi,int l,out int r);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint a,bool i,int p);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h,IntPtr b,byte[] buf,IntPtr s,out IntPtr r);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static string Cwd(int pid){
    IntPtr h=OpenProcess(0x0410,false,pid); if(h==IntPtr.Zero) return "";
    try{
      byte[] pbi=new byte[48]; int rl;
      if(NtQueryInformationProcess(h,0,pbi,pbi.Length,out rl)!=0) return "";
      IntPtr peb=(IntPtr)BitConverter.ToInt64(pbi,8); if(peb==IntPtr.Zero) return "";
      IntPtr pp=Rp(h,(IntPtr)((long)peb+0x20)); if(pp==IntPtr.Zero) return "";
      return Us(h,(IntPtr)((long)pp+0x38));
    } finally { CloseHandle(h); }
  }
  static IntPtr Rp(IntPtr h,IntPtr a){ byte[] b=new byte[8]; IntPtr r; if(!ReadProcessMemory(h,a,b,(IntPtr)8,out r)) return IntPtr.Zero; return (IntPtr)BitConverter.ToInt64(b,0); }
  static string Us(IntPtr h,IntPtr a){ byte[] hd=new byte[16]; IntPtr r; if(!ReadProcessMemory(h,a,hd,(IntPtr)16,out r)) return ""; ushort len=BitConverter.ToUInt16(hd,0); IntPtr buf=(IntPtr)BitConverter.ToInt64(hd,8); if(len==0||buf==IntPtr.Zero) return ""; if(len>32768) return ""; byte[] by=new byte[len]; if(!ReadProcessMemory(h,buf,by,(IntPtr)len,out r)) return ""; return Encoding.Unicode.GetString(by); }
}
"@
} catch {}
Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(claude|node|bun)(\\.exe)?$' } | ForEach-Object {
  $cwd = ''
  try { $cwd = [CcmcProc]::Cwd([int]$_.ProcessId) } catch {}
  [PSCustomObject]@{ Caption=$_.Caption; CommandLine=$_.CommandLine; ParentProcessId=$_.ParentProcessId; ProcessId=$_.ProcessId; WorkingDirectory=$cwd }
} | ConvertTo-Csv -NoTypeInformation
`

/**
 * Windows process inspector.
 * Primary: PowerShell Get-CimInstance gives pid, ppid, name, commandLine.
 * Fallback: tasklist /fo csv gives pid + name only (no commandLine).
 * No shell:true, no string interpolation — all args as arrays.
 */
export class WindowsProcessInspector implements IProcessInspector {
  async findAllProcesses(): Promise<ProcEntry[]> {
    const primary = await this.runPowerShellCimInstance()
    if (primary.length > 0) return primary

    // Fallback: plain tasklist (no /v, which fails in some environments)
    return this.runTasklist()
  }

  async findClaudeSessions(): Promise<RunningSession[]> {
    const entries = await this.findAllProcesses()
    return filterClaudeSessions(entries)
  }

  private async runPowerShellCimInstance(): Promise<ProcEntry[]> {
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', PEB_INSPECT_SCRIPT],
        {
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 8 * 1024 * 1024,
        }
      )
      return parseWmicProcessOutput(stdout)
    } catch {
      return []
    }
  }

  private async runTasklist(): Promise<ProcEntry[]> {
    try {
      // /fo csv only (no /v) — /v fails in some session types
      const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv'], {
        windowsHide: true,
        timeout: 10000,
      })
      return parseTasklistCsv(stdout)
    } catch {
      return []
    }
  }
}
