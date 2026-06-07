using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace DevProjects.App;

/// <summary>
/// Provides application-specific behavior to supplement the default Application class.
/// </summary>
public partial class App : Application
{
    // Same mutex name as the original PowerShell launcher so the two
    // implementations can never run (and write config.json) concurrently.
    private const string MutexName = "DevProjectsLauncher";
    private const string PipeName = "DevProjects.Activate";

    private Mutex? _mutex;
    private CancellationTokenSource? _pipeServerCts;
    private MainWindow? _window;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    /// <summary>
    /// The main application window. Use <c>App.Window</c> from any class that needs
    /// the window reference (for dialogs, pickers, interop, etc.).
    /// </summary>
    public static Window Window { get; private set; } = null!;

    /// <summary>
    /// The UI thread dispatcher. Use <c>App.DispatcherQueue</c> to marshal calls
    /// to the UI thread. Fully qualified to avoid CS0104 ambiguity with
    /// <see cref="Windows.System.DispatcherQueue"/>.
    /// </summary>
    public static Microsoft.UI.Dispatching.DispatcherQueue DispatcherQueue { get; private set; } = null!;

    /// <summary>
    /// The native window handle (HWND). Use for file pickers,
    /// <c>DataTransferManager</c>, and any WinRT interop that requires
    /// <c>InitializeWithWindow</c>. Only valid after <see cref="OnLaunched"/>
    /// has created the window; returns <c>0</c> before launch.
    /// </summary>
    public static nint WindowHandle =>
        Window is null ? 0 : WinRT.Interop.WindowNative.GetWindowHandle(Window);

    /// <summary>
    /// Initializes the singleton application object.
    /// </summary>
    public App()
    {
        InitializeComponent();
    }

    /// <summary>
    /// Invoked when the application is launched.
    /// </summary>
    /// <param name="args">Details about the launch request and process.</param>
    protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
    {
        _mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
        if (!createdNew)
        {
            // Another instance owns the mutex: ask it to come to the front, then exit.
            TryActivateExistingInstance();
            Exit();
            return;
        }

        _window = new MainWindow();
        Window = _window;
        DispatcherQueue = Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread();
        _window.Closed += (_, _) =>
        {
            _pipeServerCts?.Cancel();
            if (_mutex is not null)
            {
                try { _mutex.ReleaseMutex(); } catch (ApplicationException) { }
                _mutex.Dispose();
                _mutex = null;
            }
        };
        _window.Activate();

        _pipeServerCts = new CancellationTokenSource();
        _ = RunActivationPipeServerAsync(_pipeServerCts.Token);
    }

    private static void TryActivateExistingInstance()
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(timeout: 1500);
            using var writer = new StreamWriter(client);
            writer.Write("ACTIVATE");
            writer.Flush();
        }
        catch (Exception ex) when (ex is IOException or TimeoutException or UnauthorizedAccessException)
        {
            // The mutex holder might be the old PowerShell launcher (no pipe
            // server). No XAML window exists in this process path, so a Win32
            // message box is the only available UI.
            _ = MessageBoxW(IntPtr.Zero, "Dev-Projects is already running.", "Dev-Projects", 0x40 /* MB_ICONINFORMATION */);
        }
    }

    private async Task RunActivationPipeServerAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await using var server = new NamedPipeServerStream(
                    PipeName, PipeDirection.In, maxNumberOfServerInstances: 1);
                await server.WaitForConnectionAsync(ct).ConfigureAwait(false);
                using var reader = new StreamReader(server);
                var message = await reader.ReadToEndAsync(ct).ConfigureAwait(false);
                if (message == "ACTIVATE")
                {
                    _window?.DispatcherQueue.TryEnqueue(() =>
                    {
                        if (_window is null) return;
                        if (_window.AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } p)
                            p.Restore();
                        _window.Activate();
                    });
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception)
            {
                // Broken pipe, access denied, pipe-name squatting… the
                // activation server must never die silently; pause briefly
                // so a persistent failure can't become a hot loop.
                try { await Task.Delay(500, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { return; }
            }
        }
    }
}
