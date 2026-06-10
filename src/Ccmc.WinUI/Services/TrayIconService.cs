using System.Runtime.InteropServices;
using Ccmc.Core.Services;

namespace Ccmc.App.Services;

/// <summary>
/// Always-visible notification-area icon. Left-click raises <see cref="ToggleRequested"/>;
/// right-click shows a native Win32 popup menu composed from <see cref="ShellMenuComposer"/>
/// entries (pinned, then recents, then Open / Exit). Subclasses the window's WndProc like
/// <see cref="GlobalHotkey"/>. Fail-soft: if Shell_NotifyIcon refuses the add, the app runs
/// without a tray icon. Re-adds itself when Explorer restarts (TaskbarCreated).
/// </summary>
public sealed class TrayIconService : IDisposable
{
    private const int WM_TRAYICON = 0x8000 + 0x1C;  // WM_APP + arbitrary app-unique offset
    private const int WM_LBUTTONUP = 0x0202, WM_RBUTTONUP = 0x0205;
    private const uint NIM_ADD = 0, NIM_DELETE = 2;
    private const uint NIF_MESSAGE = 0x1, NIF_ICON = 0x2, NIF_TIP = 0x4;
    private const uint TPM_RETURNCMD = 0x0100, TPM_RIGHTBUTTON = 0x0002;
    private const uint MF_STRING = 0x0, MF_SEPARATOR = 0x800, MF_GRAYED = 0x1;
    private const uint LR_LOADFROMFILE = 0x10, IMAGE_ICON = 1;
    private const int GWLP_WNDPROC = -4;

    private const int FirstProjectCommandId = 1000;
    private const int OpenCommandId = 2001;
    private const int ExitCommandId = 2002;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATAW
    {
        public uint cbSize;
        public IntPtr hWnd;
        public uint uID;
        public uint uFlags;
        public uint uCallbackMessage;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
        public uint dwState, dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
        public uint uTimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public IntPtr hBalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern bool Shell_NotifyIconW(uint dwMessage, ref NOTIFYICONDATAW lpData);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadImageW(IntPtr hInst, string name, uint type, int cx, int cy, uint fuLoad);
    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);
    [DllImport("user32.dll")]
    private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool AppendMenuW(IntPtr hMenu, uint uFlags, nuint uIDNewItem, string? lpNewItem);
    [DllImport("user32.dll")]
    private static extern bool DestroyMenu(IntPtr hMenu);
    [DllImport("user32.dll")]
    private static extern int TrackPopupMenuEx(IntPtr hMenu, uint uFlags, int x, int y, IntPtr hwnd, IntPtr lptpm);
    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint RegisterWindowMessageW(string lpString);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtrW(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll")]
    private static extern IntPtr CallWindowProcW(IntPtr lpPrevWndFunc, IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private IntPtr _hwnd;
    private IntPtr _oldProc;
    private WndProcDelegate? _newProc;   // kept alive against GC
    private IntPtr _icon;
    private uint _taskbarCreatedMsg;
    private bool _added;
    private IReadOnlyList<ShellMenuEntry> _currentEntries = [];

    /// <summary>Returns the current pinned+recent entries; called fresh on every right-click.</summary>
    public Func<IReadOnlyList<ShellMenuEntry>>? EntriesProvider { get; set; }

    public event Action? ToggleRequested;
    public event Action? OpenRequested;
    public event Action? ExitRequested;
    public event Action<string>? LaunchRequested; // project path

    /// <summary>Adds the icon. Returns false (and leaves nothing behind) if the shell refuses.</summary>
    public bool Register(IntPtr hwnd)
    {
        _hwnd = hwnd;
        _taskbarCreatedMsg = RegisterWindowMessageW("TaskbarCreated");
        _icon = LoadIconHandle();
        if (_icon == IntPtr.Zero) return false;

        _newProc = HookProc;
        _oldProc = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, Marshal.GetFunctionPointerForDelegate(_newProc));

        _added = AddIcon();
        if (!_added)
        {
            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, _oldProc);
            _oldProc = IntPtr.Zero;
            DestroyIcon(_icon);
            _icon = IntPtr.Zero;
        }
        return _added;
    }

    private static IntPtr LoadIconHandle()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (!File.Exists(path)) return IntPtr.Zero;
        return LoadImageW(IntPtr.Zero, path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
    }

    private bool AddIcon()
    {
        var data = MakeData();
        data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        data.uCallbackMessage = WM_TRAYICON;
        data.hIcon = _icon;
        data.szTip = "Claude Code Management Console";
        return Shell_NotifyIconW(NIM_ADD, ref data);
    }

    private NOTIFYICONDATAW MakeData() => new()
    {
        cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATAW>(),
        hWnd = _hwnd,
        uID = 1,
        szTip = string.Empty,
        szInfo = string.Empty,
        szInfoTitle = string.Empty,
    };

    private IntPtr HookProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_TRAYICON)
        {
            switch (lParam.ToInt64() & 0xFFFF)
            {
                case WM_LBUTTONUP: ToggleRequested?.Invoke(); break;
                case WM_RBUTTONUP: ShowMenu(); break;
            }
        }
        else if (_taskbarCreatedMsg != 0 && msg == _taskbarCreatedMsg && _added)
        {
            AddIcon(); // Explorer restarted: the icon is gone; put it back
        }
        return CallWindowProcW(_oldProc, hWnd, msg, wParam, lParam);
    }

    private void ShowMenu()
    {
        var menu = CreatePopupMenu();
        if (menu == IntPtr.Zero) return;
        try
        {
            _currentEntries = EntriesProvider?.Invoke() ?? [];
            var anyPinned = false;
            var anyRecent = false;
            for (var i = 0; i < _currentEntries.Count; i++)
            {
                var e = _currentEntries[i];
                if (e.IsPinned) anyPinned = true;
                if (!e.IsPinned && anyPinned && !anyRecent)
                    AppendMenuW(menu, MF_SEPARATOR, 0, null); // pinned → recents divider
                if (!e.IsPinned) anyRecent = true;
                AppendMenuW(menu, MF_STRING, (nuint)(FirstProjectCommandId + i), e.Label);
            }
            if (_currentEntries.Count == 0)
                AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, "No recent projects");
            AppendMenuW(menu, MF_SEPARATOR, 0, null);
            AppendMenuW(menu, MF_STRING, OpenCommandId, "Open ccmc");
            AppendMenuW(menu, MF_STRING, ExitCommandId, "Exit");

            // Required by TrackPopupMenu: without foreground ownership the menu
            // won't dismiss when the user clicks elsewhere.
            SetForegroundWindow(_hwnd);
            GetCursorPos(out var pt);
            var cmd = TrackPopupMenuEx(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, pt.X, pt.Y, _hwnd, IntPtr.Zero);

            if (cmd == OpenCommandId) OpenRequested?.Invoke();
            else if (cmd == ExitCommandId) ExitRequested?.Invoke();
            else if (cmd >= FirstProjectCommandId && cmd < FirstProjectCommandId + _currentEntries.Count)
                LaunchRequested?.Invoke(_currentEntries[cmd - FirstProjectCommandId].Path);
        }
        finally
        {
            DestroyMenu(menu);
        }
    }

    public void Dispose()
    {
        if (_added)
        {
            var data = MakeData();
            Shell_NotifyIconW(NIM_DELETE, ref data);
            _added = false;
        }
        if (_oldProc != IntPtr.Zero) { SetWindowLongPtrW(_hwnd, GWLP_WNDPROC, _oldProc); _oldProc = IntPtr.Zero; }
        if (_icon != IntPtr.Zero) { DestroyIcon(_icon); _icon = IntPtr.Zero; }
    }
}
