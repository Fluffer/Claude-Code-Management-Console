using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Ccmc.App.Views;

public sealed partial class QuickPromptDialog : ContentDialog
{
    public QuickPromptDialog()
    {
        InitializeComponent();
        Loaded += (_, _) => InputBox.Focus(FocusState.Programmatic);
    }

    public string PromptText => InputBox.Text;

    private void InputBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        IsPrimaryButtonEnabled = !string.IsNullOrWhiteSpace(InputBox.Text);
    }
}
