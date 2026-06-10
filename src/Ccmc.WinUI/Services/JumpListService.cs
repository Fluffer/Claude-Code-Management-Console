using System.Runtime.InteropServices;
using Ccmc.Core.Services;

namespace Ccmc.App.Services;

/// <summary>
/// Rebuilds the taskbar jump list ("Pinned" and "Recent" categories) via
/// ICustomDestinationList COM interop — the WinRT JumpList API needs package
/// identity, which the unpackaged publish lacks. Items are IShellLinks that
/// invoke this exe with the project's ccmc:// link as the argument, so they
/// work even if protocol registration failed. All failures are swallowed:
/// the previous jump list simply persists.
/// </summary>
public static class JumpListService
{
    private const int JumpListRecentCap = 8;

    public static void Rebuild(IReadOnlyList<ShellMenuEntry> entries)
    {
        try
        {
            var exe = Environment.ProcessPath;
            if (exe is null) return;

            var list = (ICustomDestinationList)new DestinationList();
            var riid = typeof(IObjectArray).GUID;
            list.BeginList(out _, ref riid, out _);
            var committed = false;
            try
            {
                var pinned = entries.Where(e => e.IsPinned).ToList();
                var recent = entries.Where(e => !e.IsPinned).Take(JumpListRecentCap).ToList();
                AppendCategory(list, "Pinned", pinned, exe);
                AppendCategory(list, "Recent", recent, exe);
                list.CommitList();
                committed = true;
            }
            finally
            {
                // A half-built list left uncommitted keeps the shell transaction
                // open until the RCW is collected; abort it deterministically.
                if (!committed) { try { list.AbortList(); } catch { } }
            }
        }
        catch (Exception)
        {
            // COM failures (shell policy, server busy) must never surface.
        }
    }

    private static void AppendCategory(ICustomDestinationList list, string name,
        IReadOnlyList<ShellMenuEntry> entries, string exe)
    {
        if (entries.Count == 0) return;
        var collection = (IObjectCollection)new EnumerableObjectCollection();
        foreach (var e in entries)
            collection.AddObject(MakeLink(exe, e));
        list.AppendCategory(name, (IObjectArray)collection);
    }

    private static IShellLinkW MakeLink(string exe, ShellMenuEntry entry)
    {
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(exe);
        link.SetArguments(DeepLinkBuilder.Build(entry.Label));
        link.SetDescription($"Launch Claude in {entry.Label}");
        link.SetIconLocation(exe, 0);

        // The visible title comes from PKEY_Title, not the description.
        // Cast IShellLinkW to IPropertyStore: legal at compile time (COM interface
        // to COM interface); the RCW performs QueryInterface at runtime.
        var store = (IPropertyStore)(object)link;
        var pkeyTitle = new PROPERTYKEY
        {
            fmtid = new Guid("F29F85E0-4FF9-1068-AB91-08002B27B3D9"),
            pid = 2,
        };
        var title = new PROPVARIANT(entry.Label);
        try
        {
            store.SetValue(ref pkeyTitle, ref title);
            store.Commit();
        }
        finally
        {
            title.Clear();
        }
        return link;
    }

    // ---------- COM interop ----------

    [ComImport, Guid("77F10CF0-3DB5-4966-B520-B7C54FD35ED6"), ClassInterface(ClassInterfaceType.None)]
    private class DestinationList { }

    [ComImport, Guid("2D3468C1-36A7-43B6-AC24-D3F02FD9607A"), ClassInterface(ClassInterfaceType.None)]
    private class EnumerableObjectCollection { }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046"), ClassInterface(ClassInterfaceType.None)]
    private class ShellLink { }

    [ComImport, Guid("6332DEBF-87B5-4670-90C0-5E57B408A49E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ICustomDestinationList
    {
        void SetAppID([MarshalAs(UnmanagedType.LPWStr)] string pszAppID);
        void BeginList(out uint pcMaxSlots, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        void AppendCategory([MarshalAs(UnmanagedType.LPWStr)] string pszCategory, IObjectArray poa);
        void AppendKnownCategory(int category);
        void AddUserTasks(IObjectArray poa);
        void CommitList();
        void GetRemovedDestinations(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        void DeleteList([MarshalAs(UnmanagedType.LPWStr)] string? pszAppID);
        void AbortList();
    }

    [ComImport, Guid("92CA9DCD-5622-4BBA-A805-5E9F541BD8C9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IObjectArray
    {
        void GetCount(out uint pcObjects);
        void GetAt(uint uiIndex, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [ComImport, Guid("5632B1A4-E38A-400A-928A-D4CD63230295"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IObjectCollection
    {
        // IObjectArray
        void GetCount(out uint pcObjects);
        void GetAt(uint uiIndex, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        // IObjectCollection
        void AddObject([MarshalAs(UnmanagedType.IUnknown)] object punk);
        void AddFromArray(IObjectArray poaSource);
        void RemoveObjectAt(uint uiIndex);
        void Clear();
    }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszFile, int cch, IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out ushort pwHotkey);
        void SetHotkey(ushort wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPERTYKEY
    {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPVARIANT
    {
        private ushort vt;
        private ushort r1, r2, r3;
        private IntPtr data;
        private IntPtr data2;

        public PROPVARIANT(string value)
        {
            vt = 31; // VT_LPWSTR
            r1 = r2 = r3 = 0;
            data = Marshal.StringToCoTaskMemUni(value);
            data2 = IntPtr.Zero;
        }

        public void Clear()
        {
            if (data != IntPtr.Zero) { Marshal.FreeCoTaskMem(data); data = IntPtr.Zero; }
        }
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        void GetCount(out uint cProps);
        void GetAt(uint iProp, out PROPERTYKEY pkey);
        void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        void SetValue(ref PROPERTYKEY key, ref PROPVARIANT propvar);
        void Commit();
    }
}
