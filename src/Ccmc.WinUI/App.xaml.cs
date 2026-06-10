using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace Ccmc.App;

/// <summary>
/// Provides application-specific behavior to supplement the default Application class.
/// </summary>
public partial class App : Application
{
    // Single-instance guard: a second launch hands off to the running instance
    // (via the activation pipe below) instead of opening a second window.
    private const string MutexName = "CcmcLauncher";
    private const string PipeName = "Ccmc.Activate";

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

        // Accent + font must be in Application.Resources before any XAML loads
        // so the first paint already has them.
        var state = new Ccmc.Core.Services.StateService().Load();
        Theming.Appearance.OverrideResources(state.Accent, state.Font, Theming.Palettes.Resolve(state.Theme));

        // Make ccmc:// live for the unpackaged publish; packaged installs are
        // covered by the appxmanifest and this write is harmlessly redundant.
        Services.ProtocolRegistrar.EnsureRegistered();

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

        // Protocol activation: ccmc://launch?project=<name-or-path>[&new=true].
        // The MainViewModel scans projects synchronously in its constructor, so by here
        // AllProjects is populated and HandleDeepLink can resolve the target immediately.
        // Packaged build only — an unpackaged launch reports no protocol args, so this is
        // a no-op there (acceptable for this tier).
        TryHandleProtocolActivation();

        _pipeServerCts = new CancellationTokenSource();
        _ = RunActivationPipeServerAsync(_pipeServerCts.Token);
    }

    private void TryHandleProtocolActivation()
    {
        try
        {
            var args = Microsoft.Windows.AppLifecycle.AppInstance.GetCurrent().GetActivatedEventArgs();
            if (args.Kind == Microsoft.Windows.AppLifecycle.ExtendedActivationKind.Protocol &&
                args.Data is Windows.ApplicationModel.Activation.IProtocolActivatedEventArgs p)
            {
                var link = Ccmc.Core.Services.DeepLinkParser.Parse(p.Uri?.ToString());
                if (link is { } dl) _window?.ViewModel.HandleDeepLink(dl);
            }
        }
        catch (Exception)
        {
            // Activation-arg APIs can throw in unpackaged/odd-launch contexts; a deep link
            // is a convenience entry point and must never take startup down.
        }
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
            _ = MessageBoxW(IntPtr.Zero, "Claude Code Management Console is already running.", "Claude Code Management Console", 0x40 /* MB_ICONINFORMATION */);
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
