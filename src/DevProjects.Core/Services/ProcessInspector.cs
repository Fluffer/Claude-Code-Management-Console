using System.Runtime.InteropServices;
using System.Text;

namespace DevProjects.Core.Services;

/// <summary>
/// Reads another (same-user) process's working directory and command line by
/// walking PEB -> RTL_USER_PROCESS_PARAMETERS via NtQueryInformationProcess +
/// ReadProcessMemory. x64-host-reading-x64-target only (guarded); offsets are
/// the documented-by-convention x64 layout, stable since Vista.
/// </summary>
public static class ProcessInspector
{
    private const uint ProcessQueryInformation = 0x0400;
    private const uint ProcessVmRead = 0x0010;

    // x64 structure offsets:
    private const int PebProcessParametersOffset = 0x20;
    private const int ParamsCurrentDirectoryOffset = 0x38; // CURDIR.DosPath (UNICODE_STRING)
    private const int ParamsCommandLineOffset = 0x70;      // UNICODE_STRING

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessBasicInformation
    {
        public IntPtr ExitStatus;
        public IntPtr PebBaseAddress;
        public IntPtr AffinityMask;
        public IntPtr BasePriority;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
    }

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr processHandle, int processInformationClass,
        ref ProcessBasicInformation processInformation, int processInformationLength,
        out int returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(
        IntPtr processHandle, IntPtr baseAddress, byte[] buffer, IntPtr size, out IntPtr bytesRead);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    /// <summary>
    /// Returns (current directory, command line) for the process, or null when
    /// the process is gone, access is denied, or the host isn't 64-bit.
    /// </summary>
    public static (string CurrentDirectory, string CommandLine)? ReadProcessParameters(int processId)
    {
        if (!Environment.Is64BitProcess) return null;

        var handle = OpenProcess(ProcessQueryInformation | ProcessVmRead, false, processId);
        if (handle == IntPtr.Zero) return null;
        try
        {
            var pbi = new ProcessBasicInformation();
            if (NtQueryInformationProcess(handle, 0, ref pbi,
                    Marshal.SizeOf<ProcessBasicInformation>(), out _) != 0)
                return null;
            if (pbi.PebBaseAddress == IntPtr.Zero) return null;

            var processParams = ReadPointer(handle, pbi.PebBaseAddress + PebProcessParametersOffset);
            if (processParams == IntPtr.Zero) return null;

            var cwd = ReadUnicodeString(handle, processParams + ParamsCurrentDirectoryOffset);
            var commandLine = ReadUnicodeString(handle, processParams + ParamsCommandLineOffset);
            if (cwd is null) return null;
            return (cwd, commandLine ?? "");
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    private static IntPtr ReadPointer(IntPtr handle, IntPtr address)
    {
        var buffer = new byte[IntPtr.Size];
        if (!ReadProcessMemory(handle, address, buffer, (IntPtr)buffer.Length, out var read) ||
            read != (IntPtr)buffer.Length)
            return IntPtr.Zero;
        return (IntPtr)BitConverter.ToInt64(buffer, 0);
    }

    /// <summary>Reads a UNICODE_STRING (x64: ushort Length, ushort MaxLength, pad, pointer Buffer).</summary>
    private static string? ReadUnicodeString(IntPtr handle, IntPtr address)
    {
        var header = new byte[16];
        if (!ReadProcessMemory(handle, address, header, (IntPtr)header.Length, out var read) ||
            read != (IntPtr)header.Length)
            return null;
        var length = BitConverter.ToUInt16(header, 0);
        var buffer = (IntPtr)BitConverter.ToInt64(header, 8);
        if (length == 0 || buffer == IntPtr.Zero) return "";
        if (length > 32 * 1024) return null; // sanity cap

        var bytes = new byte[length];
        if (!ReadProcessMemory(handle, buffer, bytes, (IntPtr)bytes.Length, out read) ||
            read != (IntPtr)bytes.Length)
            return null;
        return Encoding.Unicode.GetString(bytes);
    }
}
