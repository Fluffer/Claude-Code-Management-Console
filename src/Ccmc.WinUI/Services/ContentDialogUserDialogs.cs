using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Ccmc.App.Services;

/// <summary>ContentDialog-backed IUserDialogs. XamlRoot is resolved lazily because it is null until the window content loads.</summary>
public sealed class ContentDialogUserDialogs(Func<XamlRoot> xamlRootProvider) : IUserDialogs
{
    public async Task ShowMessageAsync(string title, string message)
    {
        var dialog = new ContentDialog
        {
            XamlRoot = xamlRootProvider(),
            Title = title,
            Content = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap },
            CloseButtonText = "OK",
            DefaultButton = ContentDialogButton.Close,
        };
        await DialogGate.ShowAsync(dialog);
    }

    public async Task<bool> ConfirmAsync(string title, string message, string confirmText = "Yes", string cancelText = "Cancel")
    {
        var dialog = new ContentDialog
        {
            XamlRoot = xamlRootProvider(),
            Title = title,
            Content = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap },
            PrimaryButtonText = confirmText,
            CloseButtonText = cancelText,
            DefaultButton = ContentDialogButton.Primary,
        };
        return await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary;
    }
}
