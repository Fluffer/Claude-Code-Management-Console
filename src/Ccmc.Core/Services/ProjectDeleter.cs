using System.Runtime.InteropServices;

namespace Ccmc.Core.Services;

/// <summary>
/// Deletes a project folder, either to the Recycle Bin (default) or permanently.
/// Callers are responsible for cleaning up config/pin/trust entries afterwards
/// and rescanning (same contract as ProjectMover).
/// </summary>
public static class ProjectDeleter
{
    public static void Delete(string projectPath, bool permanent)
    {
        var path = Path.GetFullPath(projectPath.TrimEnd('\\', '/'));
        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"Project folder not found: {path}");

        if (permanent) DeletePermanent(path);
        else RecycleViaShell(path);
    }

    private static void DeletePermanent(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            // Git object/pack files are read-only and make a plain recursive
            // delete fail; clear attributes and retry once.
            foreach (var entry in Directory.EnumerateFileSystemEntries(path, "*", SearchOption.AllDirectories))
                File.SetAttributes(entry, FileAttributes.Normal);
            Directory.Delete(path, recursive: true);
        }
    }

    private static void RecycleViaShell(string path)
    {
        var op = new SHFILEOPSTRUCTW
        {
            wFunc = FO_DELETE,
            // The shell expects a double-null-terminated list; the marshaller
            // appends one terminator, so add the second explicitly.
            pFrom = path + "\0",
            fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI,
        };
        var result = SHFileOperationW(ref op);
        if (result != 0)
            throw new IOException($"Could not move the folder to the Recycle Bin (shell error 0x{result:X}).");
        if (op.fAnyOperationsAborted)
            throw new OperationCanceledException("The delete operation was cancelled.");
    }

    private const uint FO_DELETE = 3;
    private const ushort FOF_NOCONFIRMATION = 0x0010;
    private const ushort FOF_ALLOWUNDO = 0x0040;
    private const ushort FOF_NOERRORUI = 0x0400;
    private const ushort FOF_SILENT = 0x0004;

    // Note: SHFILEOPSTRUCTW is packed only on x86; default sequential layout is
    // correct for the x64/arm64 builds this app ships.
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEOPSTRUCTW
    {
        public IntPtr hwnd;
        public uint wFunc;
        [MarshalAs(UnmanagedType.LPWStr)] public string pFrom;
        [MarshalAs(UnmanagedType.LPWStr)] public string? pTo;
        public ushort fFlags;
        [MarshalAs(UnmanagedType.Bool)] public bool fAnyOperationsAborted;
        public IntPtr hNameMappings;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszProgressTitle;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHFileOperationW(ref SHFILEOPSTRUCTW lpFileOp);
}
