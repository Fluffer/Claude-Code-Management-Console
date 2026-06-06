using System.IO;
using System.IO.Pipes;
using System.Windows;
using System.Windows.Threading;

namespace DevProjects.App;

public partial class App : Application
{
    // Same mutex name as the original PowerShell launcher so the two
    // implementations can never run (and write config.json) concurrently.
    private const string MutexName = "DevProjectsLauncher";
    private const string PipeName = "DevProjects.Activate";

    private Mutex? _mutex;
    private CancellationTokenSource? _pipeServerCts;

    protected override void OnStartup(StartupEventArgs e)
    {
        _mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
        if (!createdNew)
        {
            // Another instance owns the mutex: ask it to come to the front, then exit.
            TryActivateExistingInstance();
            Shutdown();
            return;
        }

        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnMainWindowClose;

        var window = new MainWindow();
        MainWindow = window;
        window.Show();

        _pipeServerCts = new CancellationTokenSource();
        _ = RunActivationPipeServerAsync(_pipeServerCts.Token);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _pipeServerCts?.Cancel();
        if (_mutex is not null)
        {
            try { _mutex.ReleaseMutex(); } catch (ApplicationException) { }
            _mutex.Dispose();
        }
        base.OnExit(e);
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
            // The mutex holder might be the old PowerShell launcher (no pipe server).
            MessageBox.Show("Dev-Projects is already running.", "Dev-Projects",
                MessageBoxButton.OK, MessageBoxImage.Information);
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
                    await Dispatcher.InvokeAsync(() =>
                    {
                        if (MainWindow is null) return;
                        if (MainWindow.WindowState == WindowState.Minimized)
                            MainWindow.WindowState = WindowState.Normal;
                        MainWindow.Activate();
                    }, DispatcherPriority.Normal, ct);
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
