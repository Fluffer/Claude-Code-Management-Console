# Appearance Port (Palettes, Accents, Fonts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port WSL Command Center's appearance system (6 dark palettes, 8 accent colors, 7-font picker) into the Dev-Projects WinUI 3 app, with all pickers in the Settings dialog and persistence in state.json.

**Architecture:** A new `Theming/` layer in `DevProjects.WinUI` (ported from `C:\Dev\Active\WSL Command Center\Wsl.App\Theming\`) overrides accent/font resources at Application scope before the window is built. `MainWindow.ApplyTheme` grows into `ApplyAppearance` (palette → solid background + Dark element theme; base themes → Mica). `AppState` gains `Accent`/`Font`. The sidebar theme ComboBox moves into `SettingsDialog` alongside new Accent and Font combos.

**Tech Stack:** .NET 9, WinUI 3 / Windows App SDK 2.1, CommunityToolkit.Mvvm, xUnit.

**Build/test commands (used in every task):**

```powershell
dotnet build "src/DevProjects.WinUI" -p:Platform=x64    # build PASS required
dotnet test                                              # all Core tests PASS required
```

---

### Task 1: AppState gains Accent + Font (TDD)

**Files:**
- Modify: `src/DevProjects.Core/Models/AppState.cs`
- Test: `tests-net/DevProjects.Core.Tests/StateServiceTests.cs` (new file)

- [ ] **Step 1: Write the failing tests**

Create `tests-net/DevProjects.Core.Tests/StateServiceTests.cs`:

```csharp
using DevProjects.Core.Models;
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class StateServiceTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-state-").FullName;
    private string StatePath => Path.Combine(_dir, "state.json");

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Defaults_IncludeAccentAndFont()
    {
        var state = new AppState();
        Assert.Equal("Default", state.Accent);
        Assert.Equal("Segoe UI Variable", state.Font);
    }

    [Fact]
    public void RoundTrip_PreservesAccentAndFont()
    {
        var svc = new StateService(StatePath);
        svc.Save(new AppState { Theme = "Dracula", Accent = "Teal", Font = "Cascadia Code" });

        var loaded = new StateService(StatePath).Load();
        Assert.Equal("Dracula", loaded.Theme);
        Assert.Equal("Teal", loaded.Accent);
        Assert.Equal("Cascadia Code", loaded.Font);
    }

    [Fact]
    public void OldStateJson_WithoutNewFields_LoadsDefaults()
    {
        // A state.json written before the appearance port has no accent/font keys.
        Directory.CreateDirectory(_dir);
        File.WriteAllText(StatePath, """{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true}""");

        var loaded = new StateService(StatePath).Load();
        Assert.Equal("Dark", loaded.Theme);
        Assert.Equal("Default", loaded.Accent);
        Assert.Equal("Segoe UI Variable", loaded.Font);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test --filter StateServiceTests`
Expected: FAIL — `AppState` has no `Accent`/`Font` members (compile error).

- [ ] **Step 3: Add the properties**

In `src/DevProjects.Core/Models/AppState.cs`, after the `Theme` property, add:

```csharp
    /// <summary>Accent color name ("Default" follows the system accent).</summary>
    public string Accent { get; set; } = "Default";

    /// <summary>UI font family name.</summary>
    public string Font { get; set; } = "Segoe UI Variable";
```

Also update the `Theme` doc comment to:

```csharp
    /// <summary>"System", "Light", "Dark", or a palette name (e.g. "Dracula", "Nord").</summary>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test`
Expected: ALL PASS (89 existing + 3 new).

- [ ] **Step 5: Commit**

```powershell
git add src/DevProjects.Core/Models/AppState.cs tests-net/DevProjects.Core.Tests/StateServiceTests.cs
git commit -m "feat: add Accent and Font to AppState"
```

---

### Task 2: Theming layer (Palettes, Accents, Appearance)

**Files:**
- Create: `src/DevProjects.WinUI/Theming/Palettes.cs`
- Create: `src/DevProjects.WinUI/Theming/Accents.cs`
- Create: `src/DevProjects.WinUI/Theming/Appearance.cs`

These are ports of `C:\Dev\Active\WSL Command Center\Wsl.App\Theming\*` with the namespace changed to `DevProjects.App.Theming` and the NavigationView-specific resource override removed (this app has no NavigationView).

- [ ] **Step 1: Write Palettes.cs**

```csharp
using Windows.UI;

namespace DevProjects.App.Theming;

/// <summary>
/// A developer color theme: a solid window background plus a signature accent.
/// The dark base theme's translucent card/text layers compose over the background,
/// which keeps every control readable and theme switching loss-free.
/// </summary>
public sealed record Palette(string Name, Color Background, Color Accent);

/// <summary>Popular developer color themes offered in Settings, after System/Light/Dark.</summary>
public static class Palettes
{
    private static Color C(uint rgb) => Color.FromArgb(
        255, (byte)(rgb >> 16), (byte)(rgb >> 8), (byte)rgb);

    public static readonly Palette[] All =
    {
        new("Dracula",          C(0x282A36), C(0xBD93F9)),
        new("Nord",             C(0x2E3440), C(0x88C0D0)),
        new("Catppuccin Mocha", C(0x1E1E2E), C(0xCBA6F7)),
        new("Tokyo Night",      C(0x1A1B26), C(0x7AA2F7)),
        new("One Dark",         C(0x282C34), C(0x61AFEF)),
        new("Gruvbox",          C(0x282828), C(0xFE8019)),
    };

    /// <summary>Every palette name, appended after System/Light/Dark in the theme combo.</summary>
    public static string[] Names()
    {
        var names = new string[All.Length];
        for (var i = 0; i < All.Length; i++) names[i] = All[i].Name;
        return names;
    }

    /// <summary>Resolve a theme name to a palette; base themes (System/Light/Dark) or unknown return null.</summary>
    public static Palette? Resolve(string? name)
    {
        foreach (var p in All)
            if (p.Name == name) return p;
        return null;
    }
}
```

- [ ] **Step 2: Write Accents.cs**

```csharp
using Windows.UI;
using Windows.UI.ViewManagement;

namespace DevProjects.App.Theming;

/// <summary>Popular accent colors offered in Settings. "Default" follows the system accent.</summary>
public static class Accents
{
    public static readonly (string Name, Color Color)[] All =
    {
        ("Default", default),
        ("Blue",    Color.FromArgb(255, 0, 120, 212)),
        ("Teal",    Color.FromArgb(255, 0, 183, 195)),
        ("Green",   Color.FromArgb(255, 22, 163, 74)),
        ("Orange",  Color.FromArgb(255, 233, 84, 32)),
        ("Purple",  Color.FromArgb(255, 124, 58, 237)),
        ("Red",     Color.FromArgb(255, 232, 17, 35)),
        ("Pink",    Color.FromArgb(255, 227, 0, 140)),
    };

    public static string[] Names()
    {
        var names = new string[All.Length];
        for (var i = 0; i < All.Length; i++) names[i] = All[i].Name;
        return names;
    }

    /// <summary>Resolve a name to a color; "Default" (or unknown) returns the live system accent.</summary>
    public static Color Resolve(string name)
    {
        foreach (var a in All)
            if (a.Name == name && name != "Default") return a.Color;
        return new UISettings().GetColorValue(UIColorType.Accent);
    }
}

/// <summary>Popular UI / console fonts offered in Settings.</summary>
public static class AppFonts
{
    public static readonly string[] All =
    {
        "Segoe UI Variable",
        "Segoe UI",
        "Anthropic Sans",
        "Cascadia Mono",
        "Cascadia Code",
        "Consolas",
        "Lucida Console",
    };
}
```

- [ ] **Step 3: Write Appearance.cs**

```csharp
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace DevProjects.App.Theming;

/// <summary>
/// Overrides the framework accent + default-font resources at Application scope.
/// MUST run before the window is constructed for the chrome to pick up the accent
/// on first paint; for live changes, re-run then force a {ThemeResource} refresh.
/// Palette themes only contribute their signature accent here — their background is
/// applied per-window (see MainWindow.ApplyAppearance), NOT via brush overrides:
/// overriding theme brushes poisons WinUI's per-theme-dictionary StaticResource
/// caches and the colors then survive switching back to a stock theme.
/// </summary>
public static class Appearance
{
    public static void OverrideResources(string accent, string font, Palette? palette = null)
    {
        var res = Application.Current.Resources;

        // Palette supplies the accent only when the user left accent on "Default".
        var c = palette is not null && accent == "Default"
            ? palette.Accent
            : Accents.Resolve(accent);

        res["SystemAccentColor"] = c;
        res["SystemAccentColorLight1"] = Lighten(c, 0.15);
        res["SystemAccentColorLight2"] = Lighten(c, 0.30);
        res["SystemAccentColorLight3"] = Lighten(c, 0.45);
        res["SystemAccentColorDark1"] = Darken(c, 0.15);
        res["SystemAccentColorDark2"] = Darken(c, 0.30);
        res["SystemAccentColorDark3"] = Darken(c, 0.45);

        res["AccentFillColorDefaultBrush"] = new SolidColorBrush(c);
        res["AccentFillColorSecondaryBrush"] = new SolidColorBrush(c) { Opacity = 0.9 };
        res["AccentFillColorTertiaryBrush"] = new SolidColorBrush(c) { Opacity = 0.8 };
        res["AccentButtonBackground"] = new SolidColorBrush(c);
        res["AccentButtonBackgroundPointerOver"] = new SolidColorBrush(c) { Opacity = 0.9 };
        res["AccentButtonBackgroundPressed"] = new SolidColorBrush(c) { Opacity = 0.8 };

        if (!string.IsNullOrWhiteSpace(font))
            res["ContentControlThemeFontFamily"] = new FontFamily(font);
    }

    private static Color Lighten(Color c, double f) => Color.FromArgb(
        c.A,
        (byte)(c.R + (255 - c.R) * f),
        (byte)(c.G + (255 - c.G) * f),
        (byte)(c.B + (255 - c.B) * f));

    private static Color Darken(Color c, double f) => Color.FromArgb(
        c.A, (byte)(c.R * (1 - f)), (byte)(c.G * (1 - f)), (byte)(c.B * (1 - f)));
}
```

- [ ] **Step 4: Build**

Run: `dotnet build "src/DevProjects.WinUI" -p:Platform=x64`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/DevProjects.WinUI/Theming
git commit -m "feat: port palette, accent and font catalog from WSL Command Center"
```

---

### Task 3: MainViewModel — Accent/Font properties + appearance event

**Files:**
- Modify: `src/DevProjects.WinUI/ViewModels/MainViewModel.cs`

- [ ] **Step 1: Extend the theme list and add option lists**

Replace (around line 69):

```csharp
    public string[] Themes { get; } = ["System", "Light", "Dark"];
```

with:

```csharp
    public string[] Themes { get; } = ["System", "Light", "Dark", .. Theming.Palettes.Names()];
    public string[] AccentOptions { get; } = Theming.Accents.Names();
    public string[] FontOptions { get; } = Theming.AppFonts.All;
```

- [ ] **Step 2: Add Accent + Font observable fields**

After `[ObservableProperty] private string _theme = "System";` (line 66) add:

```csharp
    [ObservableProperty] private string _accent = "Default";
    [ObservableProperty] private string _font = "Segoe UI Variable";
```

- [ ] **Step 3: Replace the theme event with an appearance event**

Replace:

```csharp
    /// <summary>Raised when the user picks a theme; the window applies it to its root element.</summary>
    public event Action<string>? ThemeChangeRequested;
```

with:

```csharp
    /// <summary>Raised when the user changes theme, accent or font; the window re-applies appearance.</summary>
    public event Action? AppearanceChangeRequested;
```

- [ ] **Step 4: Load the new fields in the constructor**

After `Theme = _state.Theme;` (line 114) add:

```csharp
        Accent = _state.Accent;
        Font = _state.Font;
```

- [ ] **Step 5: Persist + raise on change**

Replace `OnThemeChanged` (lines 312-317):

```csharp
    partial void OnThemeChanged(string value)
    {
        _state.Theme = value;
        _stateService.Save(_state);
        AppearanceChangeRequested?.Invoke();
    }
```

and add below it:

```csharp
    partial void OnAccentChanged(string value)
    {
        _state.Accent = value;
        _stateService.Save(_state);
        AppearanceChangeRequested?.Invoke();
    }

    partial void OnFontChanged(string value)
    {
        _state.Font = value;
        _stateService.Save(_state);
        AppearanceChangeRequested?.Invoke();
    }
```

- [ ] **Step 6: Build**

Run: `dotnet build "src/DevProjects.WinUI" -p:Platform=x64`
Expected: FAIL in `MainWindow.xaml.cs` only (`ThemeChangeRequested` no longer exists) — that is the Task 4 wiring. If there are errors in `MainViewModel.cs` itself, fix them now.

- [ ] **Step 7: Commit**

```powershell
git add src/DevProjects.WinUI/ViewModels/MainViewModel.cs
git commit -m "feat: accent and font state in MainViewModel"
```

(Committing a not-yet-green intermediate is acceptable here only because Task 4 lands the matching window change immediately after; if executing tasks out of order, do Tasks 3+4 together.)

---

### Task 4: App startup override + MainWindow.ApplyAppearance + remove sidebar combo

**Files:**
- Modify: `src/DevProjects.WinUI/App.xaml.cs`
- Modify: `src/DevProjects.WinUI/MainWindow.xaml.cs`
- Modify: `src/DevProjects.WinUI/MainWindow.xaml`

- [ ] **Step 1: Apply accent/font before the window is constructed**

In `src/DevProjects.WinUI/App.xaml.cs`, inside `OnLaunched`, directly before `_window = new MainWindow();` insert:

```csharp
        // Accent + font must be in Application.Resources before any XAML loads
        // so the first paint already has them.
        var state = new DevProjects.Core.Services.StateService().Load();
        Theming.Appearance.OverrideResources(state.Accent, state.Font, Theming.Palettes.Resolve(state.Theme));
```

- [ ] **Step 2: Wrap the window content in a font host**

WinUI inherits `FontFamily` only from ancestor *Controls*; the root `Grid` cannot carry it,
so standalone TextBlocks (status bar, list rows) would ignore the chosen font. Wrap the
existing root Grid in a ContentControl.

In `src/DevProjects.WinUI/MainWindow.xaml`, change the opening of the content from:

```xml
    <Grid x:Name="RootGrid" AllowDrop="True" Background="Transparent"
          DragOver="Root_DragOver" DragLeave="Root_DragLeave" Drop="Root_Drop">
```

to:

```xml
    <ContentControl x:Name="FontHost" IsTabStop="False"
                    HorizontalContentAlignment="Stretch" VerticalContentAlignment="Stretch">
    <Grid x:Name="RootGrid" AllowDrop="True" Background="Transparent"
          DragOver="Root_DragOver" DragLeave="Root_DragLeave" Drop="Root_Drop">
```

and change the closing of the file from:

```xml
    </Grid>
</Window>
```

to:

```xml
    </Grid>
    </ContentControl>
</Window>
```

(Indentation of the inner Grid may stay as-is; XAML does not care.)

- [ ] **Step 3: Remove the sidebar theme combo**

In `src/DevProjects.WinUI/MainWindow.xaml`, in the sidebar bottom `StackPanel`, delete this entire block (keep the divider `Border` and the Settings/Help buttons):

```xml
                    <Grid ToolTipService.ToolTip="Choose the app colour theme. 'System' follows your Windows light/dark setting.">
                        <Grid.ColumnDefinitions>
                            <ColumnDefinition Width="Auto"/>
                            <ColumnDefinition Width="*"/>
                        </Grid.ColumnDefinitions>
                        <TextBlock Grid.Column="0" Text="Theme" VerticalAlignment="Center"
                                   Margin="4,0,8,0" Opacity="0.8"/>
                        <ComboBox Grid.Column="1" HorizontalAlignment="Stretch"
                                  AutomationProperties.AutomationId="ThemeCombo"
                                  ItemsSource="{x:Bind ViewModel.Themes}"
                                  SelectedItem="{Binding Theme, Mode=TwoWay}"/>
                    </Grid>
```

- [ ] **Step 4: Rewrite theme application in MainWindow.xaml.cs**

Replace the two constructor lines:

```csharp
        ViewModel.ThemeChangeRequested += ApplyTheme;
        ApplyTheme(ViewModel.Theme);
```

with:

```csharp
        ViewModel.AppearanceChangeRequested += () => ApplyAppearance(rebuild: true);
        ApplyAppearance(rebuild: false);
```

Also delete the constructor line `SystemBackdrop = new MicaBackdrop();` (line 40) — `ApplyAppearance` now owns the backdrop.

Replace the `ApplyTheme` method (lines 85-93) with:

```csharp
    /// <summary>
    /// Applies theme + accent + font from the ViewModel. The theme is either a base
    /// theme (System/Light/Dark → Mica) or a palette name (solid background + dark
    /// base). When <paramref name="rebuild"/> is true the element theme is flipped
    /// and restored so {ThemeResource} consumers re-resolve the new resources.
    /// </summary>
    private void ApplyAppearance(bool rebuild)
    {
        var pal = Theming.Palettes.Resolve(ViewModel.Theme);
        Theming.Appearance.OverrideResources(ViewModel.Accent, ViewModel.Font, pal);

        if (!string.IsNullOrWhiteSpace(ViewModel.Font))
            FontHost.FontFamily = new FontFamily(ViewModel.Font); // inherited path for non-styled text

        if (pal is not null)
        {
            // Solid palette background; Mica would tint it with the desktop wallpaper.
            SystemBackdrop = null;
            RootGrid.Background = new SolidColorBrush(pal.Background);
            RootGrid.RequestedTheme = ElementTheme.Dark; // all palettes are dark-based
        }
        else
        {
            // Background must stay non-null (Transparent) or drop hit-testing dies.
            RootGrid.Background = new SolidColorBrush(Colors.Transparent);
            SystemBackdrop ??= new MicaBackdrop();
            RootGrid.RequestedTheme = ViewModel.Theme switch
            {
                "Light" => ElementTheme.Light,
                "Dark" => ElementTheme.Dark,
                _ => ElementTheme.Default,
            };
        }

        if (rebuild)
        {
            // Force {ThemeResource} consumers (accent pills, buttons) to re-resolve.
            var t = RootGrid.RequestedTheme;
            RootGrid.RequestedTheme = t == ElementTheme.Dark ? ElementTheme.Light : ElementTheme.Dark;
            RootGrid.RequestedTheme = t;
        }
    }
```

Add `using Windows.UI;` to the usings in `MainWindow.xaml.cs` if `Colors` does not resolve — note WinUI uses `Microsoft.UI.Colors`, so prefer `Microsoft.UI.Colors.Transparent` (namespace `Microsoft.UI` is already imported).

- [ ] **Step 5: Build**

Run: `dotnet build "src/DevProjects.WinUI" -p:Platform=x64`
Expected: PASS (Task 3's intentional break is now resolved).

- [ ] **Step 6: Commit**

```powershell
git add src/DevProjects.WinUI
git commit -m "feat: palette-aware appearance pipeline in MainWindow and startup"
```

---

### Task 5: SettingsDialog appearance pickers

**Files:**
- Modify: `src/DevProjects.WinUI/Views/SettingsDialog.xaml`
- Modify: `src/DevProjects.WinUI/Views/SettingsDialog.xaml.cs`

- [ ] **Step 1: Add the appearance section to SettingsDialog.xaml**

Change the root `Grid`'s row definitions from:

```xml
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*" MinHeight="180"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
```

to:

```xml
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*" MinHeight="180"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
```

Insert as the FIRST child of the grid (before the "Source roots" TextBlock):

```xml
        <StackPanel Grid.Row="0" Spacing="6">
            <TextBlock Text="Appearance"
                       ToolTipService.ToolTip="Theme, accent color and font. Changes apply immediately."/>
            <Grid ColumnSpacing="8">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="*"/>
                </Grid.ColumnDefinitions>
                <ComboBox x:Name="ThemeCombo" Grid.Column="0" HorizontalAlignment="Stretch"
                          Header="Theme"
                          AutomationProperties.AutomationId="ThemeCombo"
                          SelectionChanged="ThemeCombo_SelectionChanged"
                          ToolTipService.ToolTip="'System' follows Windows light/dark; palettes use a fixed dark color scheme"/>
                <ComboBox x:Name="AccentCombo" Grid.Column="1" HorizontalAlignment="Stretch"
                          Header="Accent"
                          AutomationProperties.AutomationId="AccentCombo"
                          SelectionChanged="AccentCombo_SelectionChanged"
                          ToolTipService.ToolTip="'Default' follows the Windows accent color (or the palette's signature color)"/>
                <ComboBox x:Name="FontCombo" Grid.Column="2" HorizontalAlignment="Stretch"
                          Header="Font"
                          AutomationProperties.AutomationId="FontCombo"
                          SelectionChanged="FontCombo_SelectionChanged"
                          ToolTipService.ToolTip="UI font for the whole app"/>
            </Grid>
        </StackPanel>
```

Then bump the `Grid.Row` of the three existing children: "Source roots" TextBlock `0`→`1`, the roots Grid `1`→`2`, the default-root StackPanel `2`→`3`.

- [ ] **Step 2: Populate + wire in SettingsDialog.xaml.cs**

In the constructor, after `RefreshLists();` add:

```csharp
        ThemeCombo.ItemsSource = _viewModel.Themes;
        ThemeCombo.SelectedItem = _viewModel.Themes.FirstOrDefault(t => t == _viewModel.Theme) ?? "System";
        AccentCombo.ItemsSource = _viewModel.AccentOptions;
        AccentCombo.SelectedItem = _viewModel.AccentOptions.FirstOrDefault(a => a == _viewModel.Accent) ?? "Default";
        FontCombo.ItemsSource = _viewModel.FontOptions;
        FontCombo.SelectedItem = _viewModel.FontOptions.FirstOrDefault(f => f == _viewModel.Font) ?? "Segoe UI Variable";
```

(The existing `_loading` flag only guards `DefaultCombo`; the appearance combos are populated before any user interaction, and assigning `SelectedItem` to the already-current value raises `SelectionChanged` once — harmless because setting the ViewModel property to its current value is a no-op for `[ObservableProperty]`.)

Add the three handlers at the end of the class:

```csharp
    private void ThemeCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ThemeCombo.SelectedItem is string theme) _viewModel.Theme = theme;
    }

    private void AccentCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (AccentCombo.SelectedItem is string accent) _viewModel.Accent = accent;
    }

    private void FontCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (FontCombo.SelectedItem is string font) _viewModel.Font = font;
    }
```

- [ ] **Step 3: Build**

Run: `dotnet build "src/DevProjects.WinUI" -p:Platform=x64`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/DevProjects.WinUI/Views
git commit -m "feat: theme, accent and font pickers in Settings dialog"
```

---

### Task 6: Verification + smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full build + tests**

```powershell
dotnet build -p:Platform=x64     # PASS
dotnet test                      # ALL PASS
```

- [ ] **Step 2: Smoke run**

```powershell
winapp run "src/DevProjects.WinUI/bin/x64/Debug/net9.0-windows10.0.26100.0/win-x64" --detach --quiet
```

Verify manually (or via screenshots):
1. App opens with previous theme; sidebar no longer has a Theme combo.
2. Settings → Appearance row shows Theme (9 entries), Accent (8), Font (7).
3. Pick "Dracula" → window goes solid dark purple-tinted, accent pills recolor, dialog stays usable.
4. Pick accent "Teal" → buttons/badges recolor live.
5. Pick font "Cascadia Code" → text changes app-wide (status bar included).
6. Switch back to "System" → Mica returns, stock colors return (no palette bleed-through).
7. Close + relaunch → all three choices persisted.

- [ ] **Step 3: Close the app, final commit if any fixes were made**

```powershell
Stop-Process -Name "Dev-Projects" -ErrorAction SilentlyContinue
git status --short   # expect clean
```
