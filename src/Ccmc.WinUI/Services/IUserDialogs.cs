namespace Ccmc.App.Services;

/// <summary>UI-thread message/confirm dialogs, abstracted so the ViewModel stays testable.</summary>
public interface IUserDialogs
{
    Task ShowMessageAsync(string title, string message);
    Task<bool> ConfirmAsync(string title, string message, string confirmText = "Yes", string cancelText = "Cancel");
}
