using System.Runtime.InteropServices;

namespace Ccmc.App.Services;

/// <summary>
/// Registers ONE system-wide hotkey (default Ctrl+Alt+Space) and raises <see cref="Pressed"/> when
/// it fires. Subclasses the window's WndProc to catch WM_HOTKEY. Fail-soft: <see cref="Register"/>
/// returns false if the OS refuses the combo (already owned) — the caller just skips the feature.
/// </summary>
public sealed class GlobalHotkey : IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const int HOTKEY_ID = 0xA11C;          // arbitrary, app-unique
    private const uint MOD_ALT = 0x0001, MOD_CONTROL = 0x0002, MOD_NOREPEAT = 0x4000;
    private const uint VK_SPACE = 0x20;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtrW(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll")]
    private static extern IntPtr CallWindowProcW(IntPtr lpPrevWndFunc, IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private const int GWLP_WNDPROC = -4;
    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private IntPtr _hwnd;
    private IntPtr _oldProc;
    private WndProcDelegate? _newProc;   // kept alive against GC
    private bool _registered;

    /// <summary>Raised on the UI thread when the hotkey fires.</summary>
    public event Action? Pressed;

    public bool Register(IntPtr hwnd)
    {
        _hwnd = hwnd;
        _newProc = HookProc;
        _oldProc = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, Marshal.GetFunctionPointerForDelegate(_newProc));
        _registered = RegisterHotKey(hwnd, HOTKEY_ID, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_SPACE);
        if (!_registered) // restore the original proc — don't leave a dangling subclass
        {
            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, _oldProc);
            _oldProc = IntPtr.Zero;
        }
        return _registered;
    }

    private IntPtr HookProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == HOTKEY_ID) Pressed?.Invoke();
        return CallWindowProcW(_oldProc, hWnd, msg, wParam, lParam);
    }

    public void Dispose()
    {
        if (_registered) { UnregisterHotKey(_hwnd, HOTKEY_ID); _registered = false; }
        if (_oldProc != IntPtr.Zero) { SetWindowLongPtrW(_hwnd, GWLP_WNDPROC, _oldProc); _oldProc = IntPtr.Zero; }
    }
}
