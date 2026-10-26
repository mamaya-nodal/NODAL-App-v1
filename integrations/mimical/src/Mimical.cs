// MIMICAL 1.0 - NodalBots - 2026-10-21
// Production account copier derived from the validated NodalSimCopier 0.4.9 engine.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;

namespace NinjaTrader.NinjaScript.AddOns
{
    // Reservation ledger for a crossed inverse entry. All calls are serialized by gate.
    // CancelPending is deliberately NOT terminal; the original may still execute.
    public sealed class MimicalEntryRecovery
    {
        public int LeaderFilled;
        public int OriginalFilled;
        public bool OriginalTerminal;
        public bool Suppressed;
        public int Reserved;

        public void ObserveLeader(int filled) { LeaderFilled = Math.Max(LeaderFilled, filled); }
        public void ObserveOriginal(int filled, bool terminal)
        {
            OriginalFilled = Math.Max(OriginalFilled, filled);
            OriginalTerminal |= terminal;
        }
        public int ReserveNext(decimal ratio)
        {
            if (!OriginalTerminal || Suppressed) return 0;
            int target = checked((int)decimal.Truncate(Math.Abs(LeaderFilled * ratio)));
            int quantity = Math.Max(0, target - OriginalFilled - Reserved);
            Reserved = checked(Reserved + quantity);
            return quantity;
        }
        public static bool StopIsCrossed(bool buy, double stop, double last, double bid, double ask)
        {
            if (stop <= 0) return false;
            return buy ? ((last > 0 && stop <= last) || (ask > 0 && stop <= ask))
                       : ((last > 0 && stop >= last) || (bid > 0 && stop >= bid));
        }
    }

    public static class MimicalTrailingMath
    {
        public static double ActivationPrice(bool coverageIsLong, double leaderStopPrice, int offsetTicks, double tick)
        {
            double raw = coverageIsLong ? leaderStopPrice + offsetTicks * tick : leaderStopPrice - offsetTicks * tick;
            return Math.Round(raw / tick, MidpointRounding.AwayFromZero) * tick;
        }

        public static bool ActivationReached(bool coverageIsLong, double price, double activationPrice)
        {
            return coverageIsLong ? price >= activationPrice - 0.0000001 : price <= activationPrice + 0.0000001;
        }

        public static double FavorableTicks(bool isLong, double entry, double price, double tick)
        {
            return isLong ? (price - entry) / tick : (entry - price) / tick;
        }

        public static double StopPrice(bool isLong, double bestPrice, int distanceTicks, double tick)
        {
            double raw = isLong ? bestPrice - distanceTicks * tick : bestPrice + distanceTicks * tick;
            return Math.Round(raw / tick, MidpointRounding.AwayFromZero) * tick;
        }

        public static bool Improves(bool isLong, double desired, double current, int frequencyTicks, double tick)
        {
            return isLong ? desired >= current + frequencyTicks * tick - 0.0000001
                          : desired <= current - frequencyTicks * tick + 0.0000001;
        }

        public static int RebasedDistanceTicks(bool isLong, double bestPrice, double manualStopPrice, double tick)
        {
            double raw = isLong ? (bestPrice - manualStopPrice) / tick : (manualStopPrice - bestPrice) / tick;
            return Math.Max(1, (int)Math.Round(raw, MidpointRounding.AwayFromZero));
        }

    }

    public sealed class MimicalAddOn : AddOnBase
    {
        private NTMenuItem menu;
        private NTMenuItem parent;
        private NTMenuItem nodalBotsMenu;
        private bool ownsNodalBotsMenu;
        private MimicalWindow view;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "MIMICAL";
                Description = "MIMICAL 1.0 · Copiador de órdenes y trailing de cobertura de NodalBots";
            }
        }

        protected override void OnWindowCreated(Window window)
        {
            ControlCenter controlCenter = window as ControlCenter;
            if (controlCenter == null || menu != null) return;
            parent = controlCenter.FindFirst("ControlCenterMenuItemNew") as NTMenuItem;
            if (parent == null) return;
            nodalBotsMenu = parent.Items.OfType<NTMenuItem>().FirstOrDefault(i => String.Equals(i.Header as string, "NodalBots", StringComparison.OrdinalIgnoreCase));
            if (nodalBotsMenu == null)
            {
                nodalBotsMenu = new NTMenuItem
                {
                    Header = "NodalBots",
                    Style = Application.Current.TryFindResource("MainMenuItem") as Style
                };
                parent.Items.Add(nodalBotsMenu);
                ownsNodalBotsMenu = true;
            }
            menu = new NTMenuItem
            {
                Header = "MIMICAL",
                Style = Application.Current.TryFindResource("MainMenuItem") as Style
            };
            menu.Click += Open;
            nodalBotsMenu.Items.Add(menu);
            WriteLoaderEvidence("menu_registered");
        }

        private void Open(object sender, RoutedEventArgs e)
        {
            if (view == null)
            {
                view = new MimicalWindow();
                view.Closed += delegate { view = null; };
                view.Show();
                WriteLoaderEvidence("window_opened");
            }
            else view.Activate();
        }

        private static void WriteLoaderEvidence(string eventName)
        {
            try
            {
                string directory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                    "NodalBots", "Mimical");
                Directory.CreateDirectory(directory);
                File.AppendAllText(
                    Path.Combine(directory, "loader.log"),
                    string.Format(
                        CultureInfo.InvariantCulture,
                        "{0:O}\t1.0\t{1}{2}",
                        DateTime.UtcNow,
                        eventName,
                        Environment.NewLine));
            }
            catch
            {
                // Loading evidence must never prevent NinjaTrader from opening the add-on.
            }
        }

        protected override void OnWindowDestroyed(Window window)
        {
            if (!(window is ControlCenter)) return;
            if (menu != null)
            {
                menu.Click -= Open;
                if (nodalBotsMenu != null) nodalBotsMenu.Items.Remove(menu);
                menu = null;
            }
            if (ownsNodalBotsMenu && nodalBotsMenu != null && nodalBotsMenu.Items.Count == 0)
                parent.Items.Remove(nodalBotsMenu);
            nodalBotsMenu = null;
            ownsNodalBotsMenu = false;
            if (view != null) view.Close();
        }
    }

    public sealed class MimicalWindow : NTWindow
    {
        private sealed class FollowerChoice
        {
            public Account Account;
            public CheckBox Enabled;
            public TextBox Ratio;
            public CheckBox CrossOrder;
            public TextBox Instrument;
            public TextBlock State;
        }

        private sealed class FollowerConfig
        {
            public Account Account;
            public decimal Ratio;
            public Instrument Instrument;
            public bool CrossOrder;
            public FollowerChoice Choice;
        }

        private sealed class Link
        {
            public Order LeaderOrder;
            public FollowerConfig Follower;
            public Order Order;
            public int DesiredQuantity;
            public double DesiredLimit;
            public double DesiredStop;
            public bool RestorePending;
            public bool LocalOverrideActive;
            public bool Terminal;
            public bool IsRecoveryOrder;
            public bool CancelRequested;
            public MimicalEntryRecovery Recovery;
        }

        private sealed class TrailingCoverage
        {
            public FollowerConfig Follower;
            public MarketData MarketData;
            public bool MarketDataSubscribed;
            public Order StopOrder;
            public bool Requested;
            public bool Preparing;
            public bool Prepared;
            public bool Triggered;
            public bool HadPosition;
            public bool RestorePending;
            public bool AutomatedChangePending;
            public bool ManualChangePending;
            public bool DeactivationRequested;
            public bool RestoreFinalizing;
            public int ActivationOffsetTicks;
            public int DistanceTicks;
            public int ActiveDistanceTicks;
            public int FrequencyTicks;
            public int AutomatedTargetQuantity;
            public int SignedQuantity;
            public double EntryPrice;
            public double LeaderStopPrice;
            public double ActivationPrice;
            public Order LeaderStopOrder;
            public double BestPrice;
            public double LastStopPrice;
            public double AutomatedTargetStopPrice;
            public double LastPrice;
            public string NormalOco;
            public Order RestoreTakeProfitOrder;
            public Link RestoreTakeProfitLink;
            public Link RestoreStopLink;
        }

        private sealed class CopyPlan
        {
            public FollowerConfig Follower;
            public Link Link;
            public OrderAction Action;
            public OrderType Type;
        }

        private sealed class ReconcileCheck
        {
            public FollowerConfig Follower;
            public int Expected;
            public int Actual;
            public string Key;
        }

        private readonly ComboBox leaderBox = new ComboBox { MinWidth = 190, MaxDropDownHeight = 300 };
        private readonly TextBox leaderInstrumentBox = new TextBox { Text = "NQ DEC26", MinWidth = 150 };
        private readonly Grid settings = new Grid();
        private readonly StackPanel followerRows = new StackPanel();
        private readonly Button flattenButton = new Button { Content = "FLATTEN ALL", Margin = new Thickness(4), MinWidth = 130, Height = 34, IsEnabled = false };
        private readonly Button trailingButton = new Button { Content = "ACTIVAR TRAILING", Margin = new Thickness(4), MinWidth = 145, Height = 34, IsEnabled = false };
        private readonly TextBlock trailingCheck = new TextBlock { Text = "OFF", Foreground = ColorBrush(150, 153, 160), FontSize = 11, FontWeight = FontWeights.Bold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        private readonly Border trailingIndicator;
        private readonly TextBox activationOffsetTicksBox = new TextBox { Text = "3", MinWidth = 70 };
        private readonly TextBox distanceTicksBox = new TextBox { Text = "3", MinWidth = 70 };
        private readonly TextBox frequencyTicksBox = new TextBox { Text = "1", MinWidth = 70 };
        private readonly TextBlock trailingStateText = new TextBlock { Visibility = Visibility.Collapsed };
        private readonly TextBlock status = new TextBlock { Text = "CONFIGURAR", TextWrapping = TextWrapping.NoWrap, FontWeight = FontWeights.Bold, FontSize = 12 };
        private readonly TextBlock lastActivity = new TextBlock { Text = "Sin actividad", TextTrimming = TextTrimming.CharacterEllipsis, Foreground = Brushes.DarkGray };
        private readonly TextBox output = new TextBox { Visibility = Visibility.Collapsed };
        private readonly TextBox licenseCodeBox = new TextBox { MinWidth = 150, MaxWidth = 180, CharacterCasing = CharacterCasing.Upper };
        private readonly Button licenseButton = new Button { Content = "VINCULAR", MinWidth = 100, Height = 28, Margin = new Thickness(8, 0, 0, 0) };
        private readonly TextBlock licenseState = new TextBlock { Text = "Verificando acceso NODAL…", Foreground = Brushes.Orange, VerticalAlignment = VerticalAlignment.Center };
        private readonly List<FollowerChoice> choices = new List<FollowerChoice>();
        private readonly List<FollowerConfig> followers = new List<FollowerConfig>();
        private readonly List<Account> subscribed = new List<Account>();
        private readonly Dictionary<Order, List<Link>> links = new Dictionary<Order, List<Link>>();
        private readonly Dictionary<Order, Link> followerLinks = new Dictionary<Order, Link>();
        private readonly Dictionary<string, string> ocoByFollower = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly Dictionary<string, DateTime> mismatchSince = new Dictionary<string, DateTime>(StringComparer.Ordinal);
        private readonly object gate = new object();
        private readonly DispatcherTimer reconciliationTimer;
        private readonly DispatcherTimer configurationTimer;
        private readonly MimicalLicenseClient licenseClient;
        private Account leader;
        private Instrument leaderInstrument;
        private StreamWriter writer;
        private bool armed;
        private bool flattening;
        private int reconciliationRunning;
        private string logPath;
        private TrailingCoverage trailing;
        private FollowerConfig detachedCoverageFollower;
        private bool configurationPending;
        private bool applyingConfiguration;
        private bool refreshingAccounts;
        private bool closingWindow;
        private bool licenseAuthorized;
        private bool licenseValidationRunning;
        private DateTime nextLicenseCheckUtc = DateTime.MinValue;

        public MimicalWindow()
        {
            licenseClient = new MimicalLicenseClient(SettingsFolder());
            trailingIndicator = new Border
            {
                Width = 58,
                Height = 24,
                CornerRadius = new CornerRadius(12),
                Background = ColorBrush(37, 38, 43),
                BorderBrush = ColorBrush(76, 78, 85),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(4, 9, 8, 9),
                Child = trailingCheck,
                ToolTip = "Trailing desactivado"
            };
            Caption = "MIMICAL · NodalBots 1.1";
            Width = 1040;
            Height = 650;
            MinWidth = 840;
            MinHeight = 520;
            Foreground = ColorBrush(232, 232, 234);
            Background = ColorBrush(15, 16, 18);

            Dictionary<string, string> saved = LoadSavedSettings();
            string savedValue;
            if (saved.TryGetValue("Instrument", out savedValue) && !String.IsNullOrWhiteSpace(savedValue)) leaderInstrumentBox.Text = savedValue;
            if (saved.TryGetValue("AfterStop", out savedValue)) activationOffsetTicksBox.Text = savedValue;
            if (saved.TryGetValue("Giveback", out savedValue)) distanceTicksBox.Text = savedValue;
            if (saved.TryGetValue("Step", out savedValue)) frequencyTicksBox.Text = savedValue;

            Grid root = new Grid { Margin = new Thickness(12) };
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            Content = root;

            Border brand = new Border
            {
                Background = ColorBrush(22, 23, 26),
                BorderBrush = ColorBrush(220, 63, 61),
                BorderThickness = new Thickness(3, 0, 0, 0),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(14, 9, 12, 9),
                Margin = new Thickness(0, 0, 0, 10)
            };
            DockPanel brandContent = new DockPanel();
            brandContent.Children.Add(new TextBlock { Text = "MIMICAL", FontSize = 18, FontWeight = FontWeights.Bold, Foreground = Brushes.White, VerticalAlignment = VerticalAlignment.Center });
            TextBlock brandMeta = new TextBlock { Text = "NodalBots  ·  1.1", Foreground = ColorBrush(179, 181, 187), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Right };
            DockPanel.SetDock(brandMeta, Dock.Right);
            brandContent.Children.Add(brandMeta);
            brand.Child = brandContent;
            Grid.SetRow(brand, 0);
            root.Children.Add(brand);

            Border licenseCard = new Border
            {
                Background = ColorBrush(22, 23, 26), BorderBrush = ColorBrush(68, 69, 74),
                BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4),
                Padding = new Thickness(12, 8, 12, 8), Margin = new Thickness(0, 0, 0, 10)
            };
            DockPanel licensePanel = new DockPanel();
            StackPanel licenseEntry = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            licenseCodeBox.ToolTip = "Código de 8 caracteres generado en NODAL App";
            PrepareInput(licenseCodeBox);
            licenseCodeBox.Height = 28;
            licenseEntry.Children.Add(licenseCodeBox);
            licenseEntry.Children.Add(licenseButton);
            DockPanel.SetDock(licenseEntry, Dock.Right);
            licensePanel.Children.Add(licenseEntry);
            licensePanel.Children.Add(licenseState);
            licenseCard.Child = licensePanel;
            Grid.SetRow(licenseCard, 1);
            root.Children.Add(licenseCard);

            settings.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(270) });
            settings.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(12) });
            settings.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            Grid.SetRow(settings, 2);
            root.Children.Add(settings);

            Border leftCard = Card();
            Grid.SetColumn(leftCard, 0);
            settings.Children.Add(leftCard);
            StackPanel left = new StackPanel { Margin = new Thickness(14) };
            leftCard.Child = left;
            left.Children.Add(SectionTitle("CONFIGURACIÓN"));
            left.Children.Add(Label("Instrumento líder"));
            PrepareInput(leaderInstrumentBox);
            left.Children.Add(leaderInstrumentBox);
            left.Children.Add(Label("Cuenta líder"));
            PrepareInput(leaderBox);
            left.Children.Add(leaderBox);
            left.Children.Add(Label("TRAILING DE COBERTURA"));
            Grid trailingFields = new Grid { Margin = new Thickness(0, 4, 0, 0) };
            trailingFields.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            trailingFields.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            trailingFields.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            trailingFields.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            trailingFields.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            StackPanel triggerPanel = new StackPanel();
            triggerPanel.Children.Add(new TextBlock { Text = "Después SL", FontSize = 10, Foreground = ColorBrush(160, 162, 168) });
            PrepareInput(activationOffsetTicksBox);
            triggerPanel.Children.Add(activationOffsetTicksBox);
            Grid.SetColumn(triggerPanel, 0);
            trailingFields.Children.Add(triggerPanel);
            StackPanel distancePanel = new StackPanel();
            distancePanel.Children.Add(new TextBlock { Text = "Devuelve", FontSize = 10, Foreground = ColorBrush(160, 162, 168) });
            PrepareInput(distanceTicksBox);
            distancePanel.Children.Add(distanceTicksBox);
            Grid.SetColumn(distancePanel, 2);
            trailingFields.Children.Add(distancePanel);
            StackPanel frequencyPanel = new StackPanel();
            frequencyPanel.Children.Add(new TextBlock { Text = "Paso", FontSize = 10, Foreground = ColorBrush(160, 162, 168) });
            PrepareInput(frequencyTicksBox);
            frequencyPanel.Children.Add(frequencyTicksBox);
            Grid.SetColumn(frequencyPanel, 4);
            trailingFields.Children.Add(frequencyPanel);
            left.Children.Add(trailingFields);

            Border followerCard = Card();
            Grid.SetColumn(followerCard, 2);
            settings.Children.Add(followerCard);
            Grid followerArea = new Grid { Margin = new Thickness(14) };
            followerArea.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            followerArea.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            followerArea.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            followerCard.Child = followerArea;
            TextBlock followerTitle = SectionTitle("FOLLOWER ACCOUNTS");
            Grid.SetRow(followerTitle, 0);
            followerArea.Children.Add(followerTitle);

            Grid header = FollowerGrid();
            header.Background = ColorBrush(31, 32, 36);
            AddCell(header, new TextBlock { Text = "On", FontWeight = FontWeights.Bold }, 0);
            AddCell(header, new TextBlock { Text = "Account", FontWeight = FontWeights.Bold }, 1);
            AddCell(header, new TextBlock { Text = "Ratio", FontWeight = FontWeights.Bold }, 2);
            AddCell(header, new TextBlock { Text = "Cross Order", FontWeight = FontWeights.Bold }, 3);
            AddCell(header, new TextBlock { Text = "Instrumento", FontWeight = FontWeights.Bold }, 4);
            AddCell(header, new TextBlock { Text = "Estado", FontWeight = FontWeights.Bold }, 5);
            Grid.SetRow(header, 1);
            followerArea.Children.Add(header);

            ScrollViewer followerScroll = new ScrollViewer { Content = followerRows, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
            Grid.SetRow(followerScroll, 2);
            followerArea.Children.Add(followerScroll);

            Account[] accounts = ConnectedAccounts();
            foreach (Account account in accounts) AddAccountChoice(account, saved);

            string savedLeader;
            if (saved.TryGetValue("Leader", out savedLeader) && leaderBox.Items.Cast<string>().Any(n => n == savedLeader)) leaderBox.SelectedItem = savedLeader;
            else if (leaderBox.Items.Count > 0) leaderBox.SelectedIndex = 0;
            leaderBox.SelectionChanged += delegate
            {
                if (refreshingAccounts) return;
                RefreshLeaderChoice();
                ScheduleConfigurationApply();
            };
            leaderInstrumentBox.TextChanged += delegate
            {
                foreach (FollowerChoice choice in choices.Where(c => c.CrossOrder.IsChecked == true)) UpdateCrossOrderTarget(choice);
                ScheduleConfigurationApply();
            };
            activationOffsetTicksBox.TextChanged += delegate { SaveSettings(); };
            distanceTicksBox.TextChanged += delegate { SaveSettings(); };
            frequencyTicksBox.TextChanged += delegate { SaveSettings(); };
            foreach (FollowerChoice choice in choices.Where(c => c.CrossOrder.IsChecked == true)) UpdateCrossOrderTarget(choice);
            RefreshLeaderChoice();

            DockPanel controls = new DockPanel { Margin = new Thickness(0, 10, 0, 8) };
            StackPanel actionButtons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Left };
            flattenButton.Background = ColorBrush(133, 41, 43);
            flattenButton.Foreground = Brushes.White;
            actionButtons.Children.Add(flattenButton);
            trailingButton.Background = ColorBrush(52, 54, 60);
            trailingButton.BorderBrush = ColorBrush(82, 85, 94);
            trailingButton.Foreground = Brushes.White;
            actionButtons.Children.Add(trailingButton);
            actionButtons.Children.Add(trailingIndicator);
            controls.Children.Add(actionButtons);
            Button logsButton = new Button { Content = "Registros", Margin = new Thickness(4), MinWidth = 100, Height = 34, HorizontalAlignment = HorizontalAlignment.Right };
            logsButton.Click += delegate { OpenLogFolder(); };
            DockPanel.SetDock(logsButton, Dock.Right);
            controls.Children.Add(logsButton);
            Grid.SetRow(controls, 3);
            root.Children.Add(controls);

            Border statusCard = new Border { Background = ColorBrush(19, 20, 23), BorderBrush = ColorBrush(62, 63, 68), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4), Padding = new Thickness(10, 7, 10, 7) };
            Grid statusGrid = new Grid();
            statusGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(430) });
            statusGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            statusGrid.Children.Add(status);
            Grid.SetColumn(lastActivity, 1);
            statusGrid.Children.Add(lastActivity);
            statusCard.Child = statusGrid;
            Grid.SetRow(statusCard, 4);
            root.Children.Add(statusCard);

            flattenButton.Click += delegate { FlattenGroup(); };
            licenseButton.Click += delegate { ActivateLicense(); };
            trailingButton.Click += delegate
            {
                if (trailing != null && trailing.Requested) DeactivateTrailing();
                else ActivateTrailing();
            };
            reconciliationTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
            reconciliationTimer.Tick += delegate
            {
                RefreshAccountsFromNinja();
                QueueReconcile();
                if (DateTime.UtcNow >= nextLicenseCheckUtc) ValidateLicense(false);
            };
            reconciliationTimer.Start();
            configurationTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            configurationTimer.Tick += delegate { configurationTimer.Stop(); ApplyConfigurationWhenReady(); };
            Closing += OnClosing;
            Loaded += delegate { ValidateLicense(true); };
            Closed += delegate { closingWindow = true; configurationTimer.Stop(); Stop("Ventana cerrada"); reconciliationTimer.Stop(); };
        }

        private void ActivateLicense()
        {
            string code = licenseCodeBox.Text.Trim();
            if (String.IsNullOrWhiteSpace(code))
            {
                SetLicenseState("Ingresá el código generado en NODAL App.", Brushes.Orange);
                return;
            }
            if (licenseValidationRunning) return;
            licenseValidationRunning = true;
            licenseButton.IsEnabled = false;
            SetLicenseState("Vinculando con NODAL…", Brushes.Orange);
            licenseClient.ActivateAsync(code, ApplyLicenseResult);
        }

        private void ValidateLicense(bool scheduleConfiguration)
        {
            if (licenseValidationRunning || closingWindow) return;
            licenseValidationRunning = true;
            nextLicenseCheckUtc = DateTime.UtcNow.AddMinutes(1);
            licenseClient.ValidateAsync(delegate(MimicalLicenseResult result)
            {
                ApplyLicenseResult(result);
                if (scheduleConfiguration && result.Authorized)
                    Dispatcher.BeginInvoke(new Action(ScheduleConfigurationApply));
            });
        }

        private void ApplyLicenseResult(MimicalLicenseResult result)
        {
            Dispatcher.BeginInvoke(new Action(delegate
            {
                licenseValidationRunning = false;
                licenseAuthorized = result.Authorized;
                licenseButton.IsEnabled = true;
                if (result.Authorized)
                {
                    licenseCodeBox.Text = String.Empty;
                    licenseCodeBox.Visibility = Visibility.Collapsed;
                    licenseButton.Visibility = Visibility.Collapsed;
                    SetLicenseState("✓ " + result.Message + (String.IsNullOrWhiteSpace(result.OwnerLabel) ? "" : " · " + result.OwnerLabel), ColorBrush(83, 206, 125));
                    if (!armed) ScheduleConfigurationApply();
                }
                else
                {
                    licenseCodeBox.Visibility = Visibility.Visible;
                    licenseButton.Visibility = Visibility.Visible;
                    SetLicenseState(result.Message, result.ServiceUnavailable ? Brushes.Orange : Brushes.Red);
                }
            }));
        }

        private void SetLicenseState(string text, Brush brush)
        {
            Dispatcher.BeginInvoke(new Action(delegate { licenseState.Text = text; licenseState.Foreground = brush; }));
        }
        private static Border Card()
        {
            return new Border
            {
                Background = ColorBrush(25, 26, 30),
                BorderBrush = ColorBrush(68, 69, 74),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(4)
            };
        }

        private static TextBlock SectionTitle(string text)
        {
            return new TextBlock { Text = text, FontSize = 13, FontWeight = FontWeights.Bold, Foreground = ColorBrush(226, 67, 65), Margin = new Thickness(0, 0, 0, 8) };
        }

        private static TextBlock Label(string text)
        {
            return new TextBlock { Text = text, Foreground = ColorBrush(178, 183, 190), Margin = new Thickness(0, 9, 0, 3) };
        }

        private static void PrepareInput(Control control)
        {
            control.Height = 25;
            control.Margin = new Thickness(0, 0, 0, 2);
            control.Background = ColorBrush(17, 18, 21);
            control.Foreground = Brushes.Gainsboro;
            control.BorderBrush = ColorBrush(73, 74, 80);
        }

        private static Grid FollowerGrid()
        {
            Grid grid = new Grid { MinHeight = 34 };
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(42) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.35, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(78) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(92) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(132) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(82) });
            return grid;
        }

        private static void AddCell(Grid grid, UIElement element, int column)
        {
            FrameworkElement framework = element as FrameworkElement;
            if (framework != null) framework.Margin = new Thickness(6, 4, 6, 4);
            Grid.SetColumn(element, column);
            grid.Children.Add(element);
        }

        private static Brush ColorBrush(byte red, byte green, byte blue)
        {
            return new SolidColorBrush(Color.FromRgb(red, green, blue));
        }

        private static string SettingsFolder()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NodalBots", "Mimical");
        }

        private static string EscapeSetting(string value)
        {
            return Uri.EscapeDataString(value ?? String.Empty);
        }

        private static Dictionary<string, string> LoadSavedSettings()
        {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.Ordinal);
            try
            {
                string path = Path.Combine(SettingsFolder(), "settings.txt");
                if (!File.Exists(path)) return result;
                foreach (string line in File.ReadAllLines(path))
                {
                    int split = line.IndexOf('=');
                    if (split <= 0) continue;
                    result[line.Substring(0, split)] = Uri.UnescapeDataString(line.Substring(split + 1));
                }
            }
            catch { }
            return result;
        }

        private void SaveSettings()
        {
            if (closingWindow) return;
            try
            {
                string folder = SettingsFolder();
                Directory.CreateDirectory(folder);
                List<string> lines = new List<string>();
                Action<string, string> add = (key, value) => lines.Add(key + "=" + Uri.EscapeDataString(value ?? String.Empty));
                add("Leader", leaderBox.SelectedItem as string ?? String.Empty);
                add("Instrument", leaderInstrumentBox.Text.Trim());
                add("AfterStop", activationOffsetTicksBox.Text.Trim());
                add("Giveback", distanceTicksBox.Text.Trim());
                add("Step", frequencyTicksBox.Text.Trim());
                foreach (FollowerChoice choice in choices)
                {
                    string prefix = "Follower." + EscapeSetting(choice.Account.Name) + ".";
                    add(prefix + "Enabled", choice.Enabled.IsChecked == true ? "1" : "0");
                    add(prefix + "Ratio", choice.Ratio.Text.Trim());
                    add(prefix + "Cross", choice.CrossOrder.IsChecked == true ? "1" : "0");
                    add(prefix + "Instrument", choice.Instrument.Text.Trim());
                }
                string temporary = Path.Combine(folder, "settings.tmp");
                File.WriteAllLines(temporary, lines.ToArray(), new System.Text.UTF8Encoding(false));
                File.Copy(temporary, Path.Combine(folder, "settings.txt"), true);
                File.Delete(temporary);
            }
            catch { }
        }

        private void ScheduleConfigurationApply()
        {
            if (applyingConfiguration || closingWindow) return;
            configurationPending = true;
            SaveSettings();
            if (configurationTimer != null)
            {
                configurationTimer.Stop();
                configurationTimer.Start();
            }
            if (armed) SetStatus("CAMBIO PENDIENTE · se aplicará cuando todo el grupo esté Flat", ColorBrush(234, 170, 66));
        }

        private void ApplyConfigurationWhenReady()
        {
            if (applyingConfiguration || closingWindow || flattening || !configurationPending) return;
            if (armed)
            {
                QueueReconcile();
                return;
            }
            Arm();
        }

        private void RearmForConfiguration()
        {
            if (applyingConfiguration || closingWindow || !configurationPending) return;
            applyingConfiguration = true;
            try
            {
                Stop("Actualizando configuración");
                Arm();
            }
            finally { applyingConfiguration = false; }
        }

        private void AddAccountChoice(Account account, Dictionary<string, string> saved)
        {
            if (account == null || choices.Any(c => c.Account.Name == account.Name)) return;
            leaderBox.Items.Add(account.Name);
            Grid row = FollowerGrid();
            row.Margin = new Thickness(0, 1, 0, 0);
            row.Background = choices.Count % 2 == 0 ? ColorBrush(24, 25, 28) : ColorBrush(28, 29, 33);
            string savedValue;
            string prefix = "Follower." + EscapeSetting(account.Name) + ".";
            bool enabled = saved.TryGetValue(prefix + "Enabled", out savedValue) && savedValue == "1";
            string ratio = saved.TryGetValue(prefix + "Ratio", out savedValue) ? savedValue : "1";
            bool cross = saved.TryGetValue(prefix + "Cross", out savedValue) && savedValue == "1";
            string instrument = saved.TryGetValue(prefix + "Instrument", out savedValue) ? savedValue : leaderInstrumentBox.Text.Trim();
            FollowerChoice choice = new FollowerChoice
            {
                Account = account,
                Enabled = new CheckBox { IsChecked = enabled, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
                Ratio = new TextBox { Text = ratio, Margin = new Thickness(4, 3, 4, 3) },
                CrossOrder = new CheckBox { IsChecked = cross, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, ToolTip = "NQ en la líder → MNQ en esta cuenta" },
                Instrument = new TextBox { Text = instrument, Margin = new Thickness(4, 3, 4, 3) },
                State = new TextBlock { Text = "Off", Foreground = ColorBrush(126, 128, 135), VerticalAlignment = VerticalAlignment.Center, ToolTip = account.Provider.ToString() }
            };
            PrepareInput(choice.Ratio);
            PrepareInput(choice.Instrument);
            choices.Add(choice);
            AddCell(row, choice.Enabled, 0);
            AddCell(row, new TextBlock { Text = account.Name, VerticalAlignment = VerticalAlignment.Center, ToolTip = account.Provider.ToString() }, 1);
            AddCell(row, choice.Ratio, 2);
            AddCell(row, choice.CrossOrder, 3);
            AddCell(row, choice.Instrument, 4);
            AddCell(row, choice.State, 5);
            if (cross) UpdateCrossOrderTarget(choice);
            choice.Enabled.Click += delegate { ScheduleConfigurationApply(); };
            choice.Ratio.TextChanged += delegate { ScheduleConfigurationApply(); };
            choice.CrossOrder.Click += delegate { UpdateCrossOrderTarget(choice); ScheduleConfigurationApply(); };
            choice.Instrument.TextChanged += delegate { ScheduleConfigurationApply(); };
            followerRows.Children.Add(row);
        }

        private void RefreshAccountsFromNinja()
        {
            Account[] current = ConnectedAccounts();
            string[] currentNames = current.Select(a => a.Name).OrderBy(n => n).ToArray();
            string[] visibleNames = choices.Select(c => c.Account.Name).OrderBy(n => n).ToArray();
            if (currentNames.SequenceEqual(visibleNames)) return;

            if (armed && !AllFlatAndClear(leader, leaderInstrument, followers))
            {
                SetStatus("CONEXIÓN CAMBIÓ · la lista se actualizará al finalizar el ciclo", ColorBrush(234, 170, 66));
                return;
            }

            if (armed) Stop("Actualizando cuentas conectadas");
            Dictionary<string, string> saved = LoadSavedSettings();
            string previousLeader = leaderBox.SelectedItem as string;
            string savedLeader;
            saved.TryGetValue("Leader", out savedLeader);
            refreshingAccounts = true;
            try
            {
                choices.Clear();
                followerRows.Children.Clear();
                leaderBox.Items.Clear();
                foreach (Account account in current) AddAccountChoice(account, saved);
                string desiredLeader = currentNames.Contains(previousLeader) ? previousLeader : savedLeader;
                if (!String.IsNullOrWhiteSpace(desiredLeader) && currentNames.Contains(desiredLeader)) leaderBox.SelectedItem = desiredLeader;
                else if (leaderBox.Items.Count > 0) leaderBox.SelectedIndex = 0;
                RefreshLeaderChoice();
            }
            finally { refreshingAccounts = false; }
            ScheduleConfigurationApply();
        }

        private static Account[] ConnectedAccounts()
        {
            lock (Account.All)
                return Account.All
                    .Where(a => a != null && a.Connection != null && a.Connection.Status == ConnectionStatus.Connected)
                    .OrderBy(a => a.Name)
                    .ToArray();
        }

        private void RefreshLeaderChoice()
        {
            string selected = leaderBox.SelectedItem as string;
            foreach (FollowerChoice choice in choices)
            {
                bool isLeader = choice.Account.Name == selected;
                if (isLeader) choice.Enabled.IsChecked = false;
                choice.Enabled.IsEnabled = !isLeader;
                choice.State.Text = isLeader ? "Líder" : "Listo";
                choice.State.Foreground = isLeader ? ColorBrush(86, 171, 238) : ColorBrush(148, 153, 160);
            }
        }

        private void UpdateCrossOrderTarget(FollowerChoice choice)
        {
            bool cross = choice.CrossOrder.IsChecked == true;
            choice.Instrument.IsReadOnly = cross;
            if (!cross)
            {
                choice.Instrument.Text = leaderInstrumentBox.Text.Trim();
                if (choice.Account != leader) choice.State.Text = "Listo";
                return;
            }
            try
            {
                choice.Instrument.Text = CrossOrderInstrumentName(leaderInstrumentBox.Text.Trim());
                if (choice.Account != leader)
                {
                    choice.State.Text = "NQ → MNQ";
                    choice.State.Foreground = ColorBrush(86, 171, 238);
                }
            }
            catch (Exception ex)
            {
                choice.Instrument.Text = "";
                choice.State.Text = "No disponible";
                choice.State.Foreground = Brushes.Orange;
                choice.State.ToolTip = ex.Message;
            }
        }

        private void UpdateFollowerStates(string text, Brush brush)
        {
            foreach (FollowerChoice choice in choices)
            {
                if (choice.Account == leader)
                {
                    choice.State.Text = "Líder";
                    choice.State.Foreground = ColorBrush(86, 171, 238);
                }
                else if (choice.Enabled.IsChecked == true)
                {
                    choice.State.Text = text;
                    choice.State.Foreground = brush;
                }
                else
                {
                    choice.State.Text = "Off";
                    choice.State.Foreground = ColorBrush(110, 115, 122);
                }
            }
        }

        private void OpenLogFolder()
        {
            try
            {
                string folder = SettingsFolder();
                Directory.CreateDirectory(folder);
                System.Diagnostics.Process.Start("explorer.exe", folder);
            }
            catch (Exception ex)
            {
                SetStatus("No se pudo abrir la carpeta: " + ex.Message, Brushes.Red);
            }
        }

        private void Arm()
        {
            if (armed) return;
            try
            {
                if (!licenseAuthorized) throw new InvalidOperationException("Vinculá MIMICAL desde Configuración en NODAL App.");
                string leaderName = leaderBox.SelectedItem as string;
                if (String.IsNullOrWhiteSpace(leaderName)) throw new InvalidOperationException("Elegí la cuenta líder.");
                leader = FindAccount(leaderName);
                RequireAccountPresent(leader);
                leaderInstrument = FindInstrument(leaderInstrumentBox.Text.Trim());
                followers.Clear();
                foreach (FollowerChoice choice in choices.Where(c => c.Enabled.IsChecked == true))
                {
                    if (choice.Account == leader) throw new InvalidOperationException("La cuenta líder no puede ser seguidora.");
                    RequireAccountPresent(choice.Account);
                    decimal ratio;
                    if (!decimal.TryParse(choice.Ratio.Text.Trim().Replace(',', '.'), NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out ratio) || ratio == 0 || Math.Abs(ratio) > 1000)
                        throw new InvalidOperationException("Ratio inválido para " + choice.Account.Name + ".");
                    bool crossOrder = choice.CrossOrder.IsChecked == true;
                    string targetInstrument = crossOrder ? CrossOrderInstrumentName(leaderInstrument.FullName) : choice.Instrument.Text.Trim();
                    followers.Add(new FollowerConfig { Account = choice.Account, Ratio = ratio, Instrument = FindInstrument(targetInstrument), CrossOrder = crossOrder, Choice = choice });
                }
                if (followers.Count == 0) throw new InvalidOperationException("Elegí al menos una cuenta seguidora.");
                RequireCleanStart();

                string folder = SettingsFolder();
                Directory.CreateDirectory(folder);
                logPath = Path.Combine(folder, DateTime.Now.ToString("yyyyMMdd_HHmmss_fff") + ".tsv");
                writer = new StreamWriter(logPath, false, new System.Text.UTF8Encoding(true));
                writer.WriteLine("utc\tevent\taccount\tinstrument\torder\tstate\taction\ttype\tquantity\tfilled\tlimit\tstop\tdetail");

                Subscribe(leader);
                foreach (FollowerConfig follower in followers) Subscribe(follower.Account);
                links.Clear();
                followerLinks.Clear();
                ocoByFollower.Clear();
                mismatchSince.Clear();
                ResetTrailing(false);
                detachedCoverageFollower = null;
                flattening = false;
                armed = true;
                flattenButton.IsEnabled = true;
                trailingButton.IsEnabled = true;
                trailingButton.Content = "ACTIVAR TRAILING";
                UpdateFollowerStates("ON", ColorBrush(83, 206, 125));
                configurationPending = false;
                SaveSettings();
                SetStatus("ACTIVO · " + leader.Name + " → " + String.Join(", ", followers.Select(f => f.Account.Name + " " + f.Ratio.ToString(CultureInfo.InvariantCulture))), ColorBrush(90, 211, 134));
                Log("CONFIG", leader.Name, leaderInstrument.FullName, "", "", "", "", 0, 0, 0, 0, "log=" + logPath + ";build=1.1.0-nodal-license");
                foreach (FollowerConfig follower in followers)
                    Log("FOLLOWER_CONFIG", follower.Account.Name, follower.Instrument.FullName, "", "", "", "", 0, 0, 0, 0, "ratio=" + follower.Ratio.ToString(CultureInfo.InvariantCulture) + ";crossOrder=" + follower.CrossOrder.ToString());
            }
            catch (Exception ex)
            {
                Stop("Configuración pendiente: " + ex.Message);
                SetStatus("CONFIGURAR · " + ex.Message, ColorBrush(234, 170, 66));
            }
        }

        private void Subscribe(Account account)
        {
            if (subscribed.Contains(account)) return;
            subscribed.Add(account);
            account.OrderUpdate += OnOrder;
            account.ExecutionUpdate += OnExecution;
            account.PositionUpdate += OnPosition;
        }

        private void Stop(string reason)
        {
            lock (gate) armed = false;
            ResetTrailing(false);
            detachedCoverageFollower = null;
            foreach (Account account in subscribed)
            {
                account.OrderUpdate -= OnOrder;
                account.ExecutionUpdate -= OnExecution;
                account.PositionUpdate -= OnPosition;
            }
            subscribed.Clear();
            links.Clear();
            followerLinks.Clear();
            ocoByFollower.Clear();
            mismatchSince.Clear();
            if (writer != null)
            {
                writer.Flush();
                writer.Dispose();
                writer = null;
            }
            flattenButton.IsEnabled = false;
            trailingButton.IsEnabled = false;
            trailingButton.Content = "ACTIVAR TRAILING";
            UpdateFollowerStates("Listo", ColorBrush(148, 153, 160));
            if (!closingWindow) SetStatus(reason, ColorBrush(234, 170, 66));
        }

        private void OnClosing(object sender, CancelEventArgs e)
        {
            Account leaderSnapshot;
            Instrument instrumentSnapshot;
            FollowerConfig[] followerSnapshot;
            bool inspect;
            lock (gate)
            {
                inspect = !flattening && armed && leader != null && leaderInstrument != null;
                leaderSnapshot = leader;
                instrumentSnapshot = leaderInstrument;
                followerSnapshot = followers.ToArray();
            }
            if (inspect && !AllFlatAndClear(leaderSnapshot, instrumentSnapshot, followerSnapshot))
            {
                e.Cancel = true;
                SetStatus("VENTANA ABIERTA · hay posiciones u órdenes activas; cerrá el ciclo o usá FLATTEN ALL", Brushes.Red);
            }
        }

        private void ActivateTrailing()
        {
            DiagnosticTrace("TRAILING_CLICK_ENTRY");
            TrailingCoverage pending = null;
            bool entered = false;
            try
            {
                entered = Monitor.TryEnter(gate, 2000);
                if (!entered)
                {
                    DiagnosticTrace("TRAILING_GATE_TIMEOUT");
                    status.Text = "TRAILING NO ACTIVADO · el motor está procesando un evento; reintentá en un instante";
                    status.Foreground = Brushes.Orange;
                    return;
                }
                DiagnosticTrace("TRAILING_GATE_ACQUIRED");
                try
                {
                    if (!armed) throw new InvalidOperationException("La configuración todavía no está activa.");
                    if (trailing != null && trailing.Requested) return;
                    FollowerConfig[] negative = followers.Where(f => f.Ratio < 0).ToArray();
                    if (negative.Length != 1) throw new InvalidOperationException("El trailing exige exactamente una cuenta de cobertura con ratio negativo.");
                    int activationOffset = ParseTicks(activationOffsetTicksBox, "margen después del SL", 0);
                    int distance = ParseTicks(distanceTicksBox, "devolución", 2);
                    int frequency = ParseTicks(frequencyTicksBox, "paso", 1);
                    FollowerConfig coverage = negative[0];
                    RequireAccountPresent(coverage.Account);
                    double tick = coverage.Instrument.MasterInstrument.TickSize;
                    if (tick <= 0) throw new InvalidOperationException("No se pudo determinar el tamaño de tick de " + coverage.Instrument.FullName + ".");

                    pending = new TrailingCoverage
                    {
                        Follower = coverage,
                        Requested = true,
                        NormalOco = Guid.NewGuid().ToString("N"),
                        ActivationOffsetTicks = activationOffset,
                        DistanceTicks = distance,
                        ActiveDistanceTicks = distance,
                        FrequencyTicks = frequency
                    };
                    DiagnosticTrace("TRAILING_BEFORE_MARKETDATA");
                    pending.MarketData = new MarketData(coverage.Instrument);
                    DiagnosticTrace("TRAILING_AFTER_MARKETDATA");
                    trailing = pending;
                    trailingButton.IsEnabled = true;
                    trailingButton.Content = "DESACTIVAR TRAILING";
                    SetTrailingIndicator(1, "Trailing activo");
                    trailingStateText.Text = "PREPARANDO · " + coverage.Account.Name;
                    trailingStateText.Foreground = Brushes.Orange;
                    Log("TRAILING_REQUESTED", coverage.Account.Name, coverage.Instrument.FullName, "", "", "", "", 0, 0, 0, 0,
                        "anchor=leaderStop;offsetTicks=" + activationOffset + ";distanceTicks=" + distance + ";frequencyTicks=" + frequency);
                    ShowTrailingStatus();
                    DiagnosticTrace("TRAILING_READY_TO_SUBSCRIBE");
                }
                catch (Exception ex)
                {
                    if (pending != null && trailing == pending) trailing = null;
                    pending = null;
                    DiagnosticTrace("TRAILING_ERROR " + ex.Message);
                    SetStatus("TRAILING NO ACTIVADO · " + ex.Message, Brushes.Red);
                }
            }
            finally
            {
                if (entered) Monitor.Exit(gate);
            }

            if (pending == null) return;
            try
            {
                // MarketData may synchronously deliver its first update while the
                // event is being attached. Attach only after releasing gate so that
                // the update callback can enter the copier without a lock cycle.
                DiagnosticTrace("TRAILING_BEFORE_SUBSCRIBE");
                pending.MarketData.Update += OnMarketData;
                pending.MarketDataSubscribed = true;
                DiagnosticTrace("TRAILING_AFTER_SUBSCRIBE");
                lock (gate)
                {
                    if (trailing != pending) return;
                    RefreshTrailingPosition();
                    TryPrepareTrailingProtection();
                    ShowTrailingStatus();
                }
                DiagnosticTrace("TRAILING_COMPLETE");
            }
            catch (Exception ex)
            {
                DiagnosticTrace("TRAILING_SUBSCRIBE_ERROR " + ex.Message);
                lock (gate)
                {
                    if (trailing == pending) trailing = null;
                }
                try
                {
                    if (pending.MarketDataSubscribed) pending.MarketData.Update -= OnMarketData;
                }
                catch { }
                trailingButton.IsEnabled = armed;
                trailingButton.Content = "ACTIVAR TRAILING";
                SetTrailingIndicator(0, "Trailing desactivado");
                trailingStateText.Text = "NORMAL";
                trailingStateText.Foreground = Brushes.DarkGray;
                SetStatus("TRAILING NO ACTIVADO · " + ex.Message, Brushes.Red);
            }
        }

        private void DeactivateTrailing()
        {
            DiagnosticTrace("TRAILING_DEACTIVATE_ENTRY");
            lock (gate)
            {
                try
                {
                    if (!armed || trailing == null || !trailing.Requested) return;
                    if (trailing.Triggered)
                        throw new InvalidOperationException("El trailing ya está siguiendo el precio y no puede volver al modo normal.");

                    int leaderSigned = leader == null || leaderInstrument == null ? 0 : SignedPosition(leader, leaderInstrument);
                    if (trailing.HadPosition && leaderSigned == 0)
                        throw new InvalidOperationException("La cuenta líder ya cerró; el trailing debe completar la cobertura.");

                    trailing.DeactivationRequested = true;
                    trailingButton.IsEnabled = false;
                    trailingButton.Content = "RESTAURANDO...";
                    SetTrailingIndicator(2, "Restaurando TP/SL normales");
                    Log("TRAILING_DEACTIVATE_REQUESTED", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName,
                        trailing.StopOrder == null ? "" : trailing.StopOrder.OrderId, "", "", "", 0, 0, 0, 0,
                        trailing.HadPosition ? "restaurar salidas normales" : "cancelar modo pendiente antes del fill");

                    if (!trailing.HadPosition || trailing.SignedQuantity == 0 || trailing.StopOrder == null)
                    {
                        FinishTrailingDeactivationWithoutRestore("Desactivado antes del fill");
                        return;
                    }

                    if (!trailing.Prepared)
                    {
                        if (IsWorking(trailing.StopOrder.OrderState))
                            trailing.Follower.Account.Cancel(new[] { trailing.StopOrder });
                        else
                            FinishTrailingDeactivationWithoutRestore("Desactivado antes de preparar la protección");
                        return;
                    }

                    BeginNormalExitRestore();
                }
                catch (Exception ex)
                {
                    bool leaderAlreadyClosed = trailing != null && trailing.HadPosition
                        && leader != null && leaderInstrument != null
                        && SignedPosition(leader, leaderInstrument) == 0;
                    if (trailing != null) trailing.DeactivationRequested = false;
                    trailingButton.IsEnabled = trailing != null && trailing.Requested && !trailing.Triggered && !leaderAlreadyClosed;
                    trailingButton.Content = leaderAlreadyClosed ? "TRAILING BLOQUEADO"
                        : trailing != null && trailing.Requested ? "DESACTIVAR TRAILING" : "ACTIVAR TRAILING";
                    SetTrailingIndicator(trailing != null && trailing.Requested ? 1 : 0,
                        leaderAlreadyClosed ? "Trailing activo; la líder ya cerró" : trailing != null && trailing.Requested ? "Trailing activo" : "Trailing desactivado");
                    SetStatus("NO SE PUDO DESACTIVAR · " + ex.Message, Brushes.Red);
                    Log("TRAILING_DEACTIVATE_ERROR", trailing == null ? "" : trailing.Follower.Account.Name,
                        trailing == null ? "" : trailing.Follower.Instrument.FullName, "", "", "", "", 0, 0, 0, 0, ex.Message);
                }
            }
        }

        private void FinishTrailingDeactivationWithoutRestore(string reason)
        {
            TrailingCoverage current = trailing;
            if (current == null) return;
            string accountName = current.Follower.Account.Name;
            string instrumentName = current.Follower.Instrument.FullName;
            ResetTrailing(false);
            Log("TRAILING_DEACTIVATED", accountName, instrumentName, "", "", "", "", 0, 0, 0, 0, reason);
            Dispatcher.BeginInvoke(new Action(delegate
            {
                trailingButton.Content = "ACTIVAR TRAILING";
                trailingButton.IsEnabled = armed;
                SetTrailingIndicator(0, "Trailing desactivado");
                SetStatus("ACTIVO · trailing desactivado", ColorBrush(90, 211, 134));
            }));
        }

        private void BeginNormalExitRestore()
        {
            if (trailing == null || !trailing.DeactivationRequested || !trailing.Prepared || trailing.StopOrder == null) return;
            int leaderSigned = SignedPosition(leader, leaderInstrument);
            if (leaderSigned == 0) throw new InvalidOperationException("La cuenta líder ya no tiene posición abierta.");

            Order[] exits = ActiveOrders(leader, leaderInstrument)
                .Where(o => ClosesPosition(o.OrderAction, leaderSigned))
                .ToArray();
            Order leaderStop = exits.FirstOrDefault(o => o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit);
            Order leaderTarget = exits.FirstOrDefault(o => o.OrderType == OrderType.Limit);
            if (leaderStop == null || leaderTarget == null)
                throw new InvalidOperationException("No se encontraron el SL y TP ATM vigentes de la líder.");

            FollowerConfig coverage = trailing.Follower;
            OrderAction stopAction;
            OrderType stopType;
            double stopLimit;
            double stopPrice;
            Transform(leaderTarget, coverage, leaderTarget.LimitPrice, leaderTarget.StopPrice,
                out stopAction, out stopType, out stopLimit, out stopPrice);
            if (stopType != OrderType.StopMarket || stopPrice <= 0)
                throw new InvalidOperationException("El TP vigente de la líder no pudo convertirse en el SL normal del broker.");

            int quantity = Math.Abs(trailing.SignedQuantity);
            Link stopLink = new Link
            {
                LeaderOrder = leaderTarget,
                Follower = coverage,
                Order = trailing.StopOrder,
                DesiredQuantity = quantity,
                DesiredLimit = 0,
                DesiredStop = stopPrice
            };
            trailing.RestoreStopLink = stopLink;

            if (!Same(trailing.StopOrder.StopPrice, stopPrice) || trailing.StopOrder.Quantity != quantity)
            {
                trailing.AutomatedTargetQuantity = quantity;
                trailing.AutomatedTargetStopPrice = stopPrice;
                trailing.AutomatedChangePending = true;
                trailing.StopOrder.QuantityChanged = quantity;
                trailing.StopOrder.LimitPriceChanged = 0;
                trailing.StopOrder.StopPriceChanged = stopPrice;
                coverage.Account.Change(new[] { trailing.StopOrder });
                Log("TRAILING_RESTORE_STOP", coverage.Account.Name, coverage.Instrument.FullName, trailing.StopOrder.OrderId,
                    trailing.StopOrder.OrderState.ToString(), trailing.StopOrder.OrderAction.ToString(), trailing.StopOrder.OrderType.ToString(),
                    quantity, trailing.StopOrder.Filled, 0, stopPrice, "SL normal del broker recalculado desde TP líder");
                return;
            }

            SubmitRestoredTakeProfit(leaderStop);
        }

        private void SubmitRestoredTakeProfit(Order leaderStop)
        {
            if (trailing == null || !trailing.DeactivationRequested || trailing.RestoreTakeProfitOrder != null) return;
            FollowerConfig coverage = trailing.Follower;
            int quantity = Math.Abs(trailing.SignedQuantity);
            OrderAction action;
            OrderType type;
            double limit;
            double stop;
            Transform(leaderStop, coverage, leaderStop.LimitPrice, leaderStop.StopPrice, out action, out type, out limit, out stop);
            if (type != OrderType.Limit || limit <= 0)
                throw new InvalidOperationException("El SL vigente de la líder no pudo convertirse en el TP normal del broker.");

            string name = "NODAL-RESTORE-" + Guid.NewGuid().ToString("N").Substring(0, 8);
            Order restored = coverage.Account.CreateOrder(coverage.Instrument, action, type, OrderEntry.Manual,
                leaderStop.TimeInForce, quantity, limit, 0, trailing.NormalOco, name, Core.Globals.MaxDate, null);
            Link takeProfitLink = new Link
            {
                LeaderOrder = leaderStop,
                Follower = coverage,
                Order = restored,
                DesiredQuantity = quantity,
                DesiredLimit = limit,
                DesiredStop = 0
            };
            trailing.RestoreTakeProfitOrder = restored;
            trailing.RestoreTakeProfitLink = takeProfitLink;
            AddRestoredLink(takeProfitLink);
            followerLinks[restored] = takeProfitLink;
            coverage.Account.Submit(new[] { restored });
            Log("TRAILING_RESTORE_TP_SUBMIT", coverage.Account.Name, coverage.Instrument.FullName, restored.OrderId,
                restored.OrderState.ToString(), action.ToString(), type.ToString(), quantity, 0, limit, 0,
                "TP normal del broker reconstruido desde SL líder");
        }

        private void AddRestoredLink(Link link)
        {
            List<Link> group;
            if (!links.TryGetValue(link.LeaderOrder, out group))
            {
                group = new List<Link>();
                links.Add(link.LeaderOrder, group);
            }
            group.Add(link);
        }

        private void CompleteNormalExitRestore(OrderEventArgs e)
        {
            if (trailing == null || !trailing.DeactivationRequested || e.Order != trailing.RestoreTakeProfitOrder) return;
            if (trailing.RestoreFinalizing) return;
            if (e.OrderState == OrderState.Rejected || e.Error != ErrorCode.NoError)
                throw new InvalidOperationException("El TP restaurado fue rechazado: " + e.Error + " " + e.Comment);
            if (e.OrderState != OrderState.Accepted && e.OrderState != OrderState.Working) return;

            TrailingCoverage current = trailing;
            current.RestoreFinalizing = true;
            if (current.RestoreStopLink == null) throw new InvalidOperationException("No se pudo reconstruir el vínculo del SL normal del broker.");
            if (SignedPosition(leader, leaderInstrument) == 0
                || !IsWorking(current.RestoreStopLink.LeaderOrder.OrderState)
                || !IsWorking(current.RestoreTakeProfitLink.LeaderOrder.OrderState))
                throw new InvalidOperationException("La líder cambió de estado antes de completar la restauración.");
            AddRestoredLink(current.RestoreStopLink);
            followerLinks[current.StopOrder] = current.RestoreStopLink;
            if (!String.IsNullOrWhiteSpace(current.RestoreStopLink.LeaderOrder.Oco))
                ocoByFollower[current.Follower.Account.Name + "|" + current.RestoreStopLink.LeaderOrder.Oco] = current.NormalOco;
            if (!String.IsNullOrWhiteSpace(current.RestoreTakeProfitLink.LeaderOrder.Oco))
                ocoByFollower[current.Follower.Account.Name + "|" + current.RestoreTakeProfitLink.LeaderOrder.Oco] = current.NormalOco;

            ChangeLinks(current.RestoreStopLink.LeaderOrder, current.RestoreStopLink.LeaderOrder.Quantity,
                current.RestoreStopLink.LeaderOrder.LimitPrice, current.RestoreStopLink.LeaderOrder.StopPrice);
            ChangeLinks(current.RestoreTakeProfitLink.LeaderOrder, current.RestoreTakeProfitLink.LeaderOrder.Quantity,
                current.RestoreTakeProfitLink.LeaderOrder.LimitPrice, current.RestoreTakeProfitLink.LeaderOrder.StopPrice);

            string accountName = current.Follower.Account.Name;
            string instrumentName = current.Follower.Instrument.FullName;
            string stopId = current.StopOrder.OrderId;
            string targetId = current.RestoreTakeProfitOrder.OrderId;
            ResetTrailing(false);
            Log("TRAILING_DEACTIVATED_RESTORED", accountName, instrumentName, targetId, e.OrderState.ToString(),
                e.Order.OrderAction.ToString(), e.Order.OrderType.ToString(), e.Quantity, e.Filled, e.LimitPrice, e.StopPrice,
                "TP y SL normales restaurados;stopOrder=" + stopId);
            Dispatcher.BeginInvoke(new Action(delegate
            {
                trailingButton.Content = "ACTIVAR TRAILING";
                trailingButton.IsEnabled = armed;
                SetTrailingIndicator(0, "Trailing desactivado");
                SetStatus("ACTIVO · TP/SL normales restaurados en " + accountName, ColorBrush(90, 211, 134));
            }));
        }

        private static int ParseTicks(TextBox box, string field, int minimum)
        {
            int value;
            if (!Int32.TryParse(box.Text.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out value) || value < minimum || value > 100000)
                throw new InvalidOperationException("Valor inválido para " + field + ". Mínimo: " + minimum.ToString(CultureInfo.InvariantCulture) + " ticks.");
            return value;
        }

        private void ResetTrailing(bool cancelWorkingStop)
        {
            TrailingCoverage current = trailing;
            trailing = null;
            if (current == null) return;
            SetTrailingIndicator(0, "Trailing desactivado");
            if (current.MarketData != null && current.MarketDataSubscribed)
            {
                // OrderUpdate and MarketData.Update run on different NinjaTrader
                // provider threads. ResetTrailing can be reached while gate is held;
                // removing the market-data handler synchronously here can wait for a
                // callback that is itself waiting for gate, leaving the UI forever in
                // RESTAURANDO. Mark it detached immediately and perform the actual
                // unsubscribe after the current event releases gate.
                MarketData marketData = current.MarketData;
                current.MarketDataSubscribed = false;
                Dispatcher.BeginInvoke(new Action(delegate
                {
                    try { marketData.Update -= OnMarketData; }
                    catch (Exception ex) { DiagnosticTrace("TRAILING_UNSUBSCRIBE_ERROR " + ex.Message); }
                }));
            }
            if (cancelWorkingStop && current.StopOrder != null && IsWorking(current.StopOrder.OrderState))
            {
                try { current.Follower.Account.Cancel(new[] { current.StopOrder }); }
                catch { }
            }
        }

        private void OnMarketData(object sender, MarketDataEventArgs e)
        {
            if (e == null || e.MarketDataType != MarketDataType.Last || e.Price <= 0) return;
            lock (gate)
            {
                try
                {
                    if (!armed || trailing == null || !trailing.Requested || e.Instrument.FullName != trailing.Follower.Instrument.FullName) return;
                    trailing.LastPrice = e.Price;
                    RefreshTrailingPosition();
                    if (trailing == null || trailing.SignedQuantity == 0) return;
                    if (!trailing.Prepared)
                    {
                        TryPrepareTrailingProtection();
                        if (!trailing.Prepared) return;
                    }
                    AdvanceTrailing(e.Price);
                }
                catch (Exception ex) { Trip("Error en trailing: " + ex.Message); }
            }
        }

        private void RefreshTrailingPosition()
        {
            if (trailing == null) return;
            Position position = FindPosition(trailing.Follower.Account, trailing.Follower.Instrument);
            int signed = position == null || position.MarketPosition == MarketPosition.Flat ? 0
                : position.MarketPosition == MarketPosition.Long ? position.Quantity : -position.Quantity;
            if (signed == 0)
            {
                if (trailing.HadPosition) CompleteTrailing("La cobertura quedó Flat");
                return;
            }
            if (trailing.SignedQuantity != 0 && Math.Sign(trailing.SignedQuantity) != Math.Sign(signed))
                throw new InvalidOperationException("La cobertura cambió de lado durante el trailing.");
            trailing.HadPosition = true;
            trailing.SignedQuantity = signed;
            trailing.EntryPrice = position.AveragePrice;
            // Activation after the ATM exists must not wait for another SL event.
            // These leader orders are already tracked under gate; do not acquire
            // the account order collection lock from the market-data callback.
            if (!trailing.Triggered && trailing.LeaderStopPrice <= 0)
            {
                Order existingStop = links.Keys.FirstOrDefault(o =>
                    (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit)
                    && IsWorking(o.OrderState) && o.StopPrice > 0
                    && ClosesPosition(o.OrderAction, -signed));
                if (existingStop != null)
                {
                    trailing.LeaderStopOrder = existingStop;
                    trailing.LeaderStopPrice = existingStop.StopPrice;
                }
            }
            RecalculateTrailingActivation("");
            if (trailing.BestPrice <= 0)
            {
                double initial = trailing.LastPrice > 0 ? trailing.LastPrice : position.AveragePrice;
                trailing.BestPrice = initial;
            }
        }

        private void TrackLeaderStopForTrailing(Order order, OrderEventArgs e)
        {
            if (trailing == null || !trailing.Requested || trailing.Triggered || order == null) return;
            if (order.OrderType != OrderType.StopMarket && order.OrderType != OrderType.StopLimit) return;
            int leaderSigned = SignedPosition(leader, leaderInstrument);
            if (leaderSigned == 0 || !ClosesPosition(order.OrderAction, leaderSigned)) return;
            double stopPrice = e.StopPrice > 0 ? e.StopPrice : order.StopPrice;
            if (stopPrice <= 0) return;
            bool changed = trailing.LeaderStopOrder != order || !Same(trailing.LeaderStopPrice, stopPrice);
            trailing.LeaderStopOrder = order;
            trailing.LeaderStopPrice = stopPrice;
            if (changed) RecalculateTrailingActivation(order.OrderId);
        }

        private void RecalculateTrailingActivation(string sourceOrderId)
        {
            if (trailing == null || trailing.Triggered || trailing.LeaderStopPrice <= 0 || trailing.SignedQuantity == 0) return;
            double tick = trailing.Follower.Instrument.MasterInstrument.TickSize;
            if (tick <= 0) throw new InvalidOperationException("No se pudo determinar el tamaño de tick de la cobertura.");
            bool isLong = trailing.SignedQuantity > 0;
            double activation = MimicalTrailingMath.ActivationPrice(isLong, trailing.LeaderStopPrice, trailing.ActivationOffsetTicks, tick);
            if (Same(activation, trailing.ActivationPrice)) return;
            trailing.ActivationPrice = activation;
            Log("TRAILING_ANCHOR_UPDATED", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName,
                sourceOrderId, "", "", "", Math.Abs(trailing.SignedQuantity), 0, activation, trailing.LeaderStopPrice,
                "leaderStop=" + trailing.LeaderStopPrice.ToString("R", CultureInfo.InvariantCulture)
                + ";offsetTicks=" + trailing.ActivationOffsetTicks.ToString(CultureInfo.InvariantCulture)
                + ";activationPrice=" + activation.ToString("R", CultureInfo.InvariantCulture));
            ShowTrailingStatus();
            if (trailing.Prepared && trailing.LastPrice > 0) AdvanceTrailing(trailing.LastPrice);
        }

        private void TryPrepareTrailingProtection()
        {
            if (trailing == null || !trailing.Requested || trailing.Prepared || trailing.Preparing || trailing.SignedQuantity == 0) return;
            Link protection = CoverageExitLinks()
                .FirstOrDefault(l => l.Order.OrderType == OrderType.StopMarket && IsWorking(l.Order.OrderState) && l.Order.StopPrice > 0);
            if (protection == null) return;

            trailing.Preparing = true;
            int quantity = Math.Abs(trailing.SignedQuantity);
            OrderAction action = trailing.SignedQuantity > 0 ? OrderAction.Sell : OrderAction.BuyToCover;
            string name = "NODAL-TRAIL-" + Guid.NewGuid().ToString("N").Substring(0, 8);
            Order replacement = trailing.Follower.Account.CreateOrder(trailing.Follower.Instrument, action, OrderType.StopMarket,
                OrderEntry.Manual, protection.Order.TimeInForce, quantity, 0, protection.Order.StopPrice, trailing.NormalOco, name, Core.Globals.MaxDate, null);
            trailing.StopOrder = replacement;
            trailing.LastStopPrice = protection.Order.StopPrice;
            trailing.Follower.Account.Submit(new[] { replacement });
            Log("TRAILING_PROTECTION_SUBMIT", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName,
                replacement.OrderId, replacement.OrderState.ToString(), action.ToString(), replacement.OrderType.ToString(), quantity, 0, 0, protection.Order.StopPrice,
                "reemplazo independiente;source=" + protection.Order.OrderId);
        }

        private void HandleTrailingOrder(Order order, OrderEventArgs e)
        {
            if (trailing == null || order != trailing.StopOrder) return;
            if (e.OrderState == OrderState.Rejected || e.Error != ErrorCode.NoError)
            {
                Trip("La protección trailing fue rechazada: " + e.Error + " " + e.Comment);
                return;
            }
            if (trailing.DeactivationRequested && !trailing.Prepared)
            {
                if (e.OrderState == OrderState.Accepted || e.OrderState == OrderState.Working)
                {
                    CancelRetiredOrdersAfterUpdate(trailing.Follower.Account, new[] { trailing.StopOrder });
                    return;
                }
                if (e.OrderState == OrderState.Cancelled)
                {
                    FinishTrailingDeactivationWithoutRestore("Desactivado antes de preparar la protección");
                    return;
                }
            }
            if (trailing.Triggered && !trailing.AutomatedChangePending
                && (e.OrderState == OrderState.ChangeSubmitted || e.OrderState == OrderState.ChangePending))
            {
                trailing.ManualChangePending = true;
                Log("TRAILING_MANUAL_MOVE_PENDING", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName,
                    order.OrderId, e.OrderState.ToString(), order.OrderAction.ToString(), order.OrderType.ToString(),
                    e.Quantity, e.Filled, e.LimitPrice, e.StopPrice, "se pausa el avance automático hasta que NinjaTrader acepte la nueva ubicación");
                return;
            }
            if (!trailing.Prepared && (e.OrderState == OrderState.Accepted || e.OrderState == OrderState.Working))
            {
                trailing.Prepared = true;
                trailing.Preparing = false;
                Link[] retired = CoverageExitLinks().Where(l => !l.Terminal).ToArray();
                foreach (Link link in retired) link.Terminal = true;
                Order[] working = retired.Where(l => IsWorking(l.Order.OrderState)).Select(l => l.Order).ToArray();
                foreach (Link link in retired)
                {
                    Log("TRAILING_OCO_RETIRED", link.Follower.Account.Name, link.Follower.Instrument.FullName, link.Order.OrderId,
                        link.Order.OrderState.ToString(), link.Order.OrderAction.ToString(), link.Order.OrderType.ToString(), link.Order.Quantity,
                        link.Order.Filled, link.Order.LimitPrice, link.Order.StopPrice, "protección independiente activa");
                }
                Log("TRAILING_PREPARED", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName, order.OrderId,
                    e.OrderState.ToString(), order.OrderAction.ToString(), order.OrderType.ToString(), e.Quantity, e.Filled, e.LimitPrice, e.StopPrice, "");
                ShowTrailingStatus();
                if (trailing.LastPrice > 0) AdvanceTrailing(trailing.LastPrice);
                CancelRetiredOrdersAfterUpdate(trailing.Follower.Account, working);
            }
            else if (trailing.Prepared && (e.OrderState == OrderState.Accepted || e.OrderState == OrderState.Working))
            {
                int desiredQuantity = Math.Abs(trailing.SignedQuantity);
                double reportedStop = e.StopPrice > 0 ? e.StopPrice : order.StopPrice;
                bool protectedFieldsMatch = e.Quantity == desiredQuantity && Same(e.LimitPrice, 0);

                if (trailing.AutomatedChangePending)
                {
                    bool automatedChangeArrived = e.Quantity == trailing.AutomatedTargetQuantity
                        && Same(e.LimitPrice, 0)
                        && Same(reportedStop, trailing.AutomatedTargetStopPrice);
                    if (automatedChangeArrived)
                    {
                        trailing.LastStopPrice = reportedStop;
                        trailing.AutomatedChangePending = false;
                        trailing.RestorePending = false;
                        if (trailing.DeactivationRequested)
                        {
                            int leaderSigned = SignedPosition(leader, leaderInstrument);
                            Order leaderStop = ActiveOrders(leader, leaderInstrument)
                                .FirstOrDefault(o => ClosesPosition(o.OrderAction, leaderSigned)
                                    && (o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit));
                            if (leaderStop == null) throw new InvalidOperationException("El SL de la líder dejó de estar disponible durante la restauración.");
                            SubmitRestoredTakeProfit(leaderStop);
                        }
                    }
                    return;
                }

                trailing.ManualChangePending = false;

                bool stopMatches = Same(reportedStop, trailing.LastStopPrice);
                if (trailing.Triggered && reportedStop > 0 && !stopMatches)
                {
                    AdoptManualTrailingStop(reportedStop, e.OrderState);
                    stopMatches = true;
                }

                if (protectedFieldsMatch && stopMatches)
                {
                    trailing.RestorePending = false;
                    return;
                }

                if (!trailing.RestorePending && desiredQuantity > 0)
                {
                    trailing.RestorePending = true;
                    RequestAutomatedTrailingChange(desiredQuantity, trailing.LastStopPrice);
                    Log("TRAILING_PROTECTED_FIELDS_RESTORED", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName, order.OrderId,
                        e.OrderState.ToString(), order.OrderAction.ToString(), order.OrderType.ToString(), desiredQuantity, e.Filled, 0,
                        trailing.LastStopPrice, trailing.Triggered
                            ? "se preservó el stop manual y se restauraron cantidad/tipo de precio"
                            : "antes del disparo se restauró la protección administrada por el sistema");
                }
            }
            if (e.OrderState == OrderState.Filled)
            {
                Log("TRAILING_EXIT_FILLED", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName, order.OrderId,
                    e.OrderState.ToString(), order.OrderAction.ToString(), order.OrderType.ToString(), e.Quantity, e.Filled, e.LimitPrice, e.StopPrice, "");
            }
            else if (e.OrderState == OrderState.Cancelled && trailing.Prepared && trailing.SignedQuantity != 0 && !flattening)
            {
                Trip("La protección trailing se canceló con la cobertura abierta.");
            }
        }

        private void CancelRetiredOrdersAfterUpdate(Account account, Order[] orders)
        {
            if (account == null || orders == null || orders.Length == 0) return;
            Dispatcher.BeginInvoke(new Action(delegate
            {
                try
                {
                    // Never call Cancel from inside Account.OrderUpdate: the simulator can
                    // wait for the current update to finish and deadlock the event pipeline.
                    account.Cancel(orders);
                }
                catch (Exception ex)
                {
                    lock (gate) { Trip("No se pudieron retirar las salidas OCO del broker: " + ex.Message); }
                }
            }), DispatcherPriority.Background);
        }

        private void AdvanceTrailing(double lastPrice)
        {
            if (trailing == null || trailing.DeactivationRequested || !trailing.Prepared || trailing.StopOrder == null || trailing.SignedQuantity == 0 || !IsWorking(trailing.StopOrder.OrderState) || trailing.AutomatedChangePending || trailing.ManualChangePending) return;
            double tick = trailing.Follower.Instrument.MasterInstrument.TickSize;
            bool isLong = trailing.SignedQuantity > 0;
            if ((isLong && lastPrice > trailing.BestPrice) || (!isLong && lastPrice < trailing.BestPrice)) trailing.BestPrice = lastPrice;
            if (!trailing.Triggered)
            {
                if (trailing.ActivationPrice <= 0 || !MimicalTrailingMath.ActivationReached(isLong, lastPrice, trailing.ActivationPrice)) return;
                trailing.Triggered = true;
                Dispatcher.BeginInvoke(new Action(delegate
                {
                    trailingButton.IsEnabled = false;
                    trailingButton.Content = "TRAILING SIGUIENDO";
                    SetTrailingIndicator(1, "Trailing siguiendo el precio");
                }));
                double favorableTicks = MimicalTrailingMath.FavorableTicks(isLong, trailing.EntryPrice, lastPrice, tick);
                Log("TRAILING_TRIGGERED", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName, trailing.StopOrder.OrderId,
                    trailing.StopOrder.OrderState.ToString(), trailing.StopOrder.OrderAction.ToString(), trailing.StopOrder.OrderType.ToString(),
                    trailing.StopOrder.Quantity, trailing.StopOrder.Filled, 0, trailing.StopOrder.StopPrice,
                    "price=" + lastPrice.ToString("R", CultureInfo.InvariantCulture)
                    + ";leaderStop=" + trailing.LeaderStopPrice.ToString("R", CultureInfo.InvariantCulture)
                    + ";offsetTicks=" + trailing.ActivationOffsetTicks.ToString(CultureInfo.InvariantCulture)
                    + ";activationPrice=" + trailing.ActivationPrice.ToString("R", CultureInfo.InvariantCulture)
                    + ";profitTicks=" + favorableTicks.ToString("0.##", CultureInfo.InvariantCulture));
            }

            int activeDistance = trailing.ActiveDistanceTicks > 0 ? trailing.ActiveDistanceTicks : trailing.DistanceTicks;
            double desired = MimicalTrailingMath.StopPrice(isLong, trailing.BestPrice, activeDistance, tick);
            bool improves = MimicalTrailingMath.Improves(isLong, desired, trailing.LastStopPrice, trailing.FrequencyTicks, tick);
            if (!improves) return;
            if ((isLong && desired >= lastPrice) || (!isLong && desired <= lastPrice)) return;

            double previous = trailing.LastStopPrice;
            trailing.LastStopPrice = desired;
            try
            {
                trailing.StopOrder.QuantityChanged = Math.Abs(trailing.SignedQuantity);
                trailing.StopOrder.LimitPriceChanged = 0;
                trailing.StopOrder.StopPriceChanged = desired;
                trailing.RestorePending = false;
                trailing.AutomatedChangePending = true;
                trailing.AutomatedTargetQuantity = Math.Abs(trailing.SignedQuantity);
                trailing.AutomatedTargetStopPrice = desired;
                trailing.Follower.Account.Change(new[] { trailing.StopOrder });
                Log("TRAILING_MOVE", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName, trailing.StopOrder.OrderId,
                    trailing.StopOrder.OrderState.ToString(), trailing.StopOrder.OrderAction.ToString(), trailing.StopOrder.OrderType.ToString(),
                    Math.Abs(trailing.SignedQuantity), trailing.StopOrder.Filled, 0, desired,
                    "best=" + trailing.BestPrice.ToString("R", CultureInfo.InvariantCulture) + ";last=" + lastPrice.ToString("R", CultureInfo.InvariantCulture));
                ShowTrailingStatus();
            }
            catch
            {
                trailing.LastStopPrice = previous;
                trailing.AutomatedChangePending = false;
                throw;
            }
        }

        private void AdoptManualTrailingStop(double manualStopPrice, OrderState state)
        {
            if (trailing == null || !trailing.Triggered || manualStopPrice <= 0) return;
            double tick = trailing.Follower.Instrument.MasterInstrument.TickSize;
            if (tick <= 0) throw new InvalidOperationException("No se pudo determinar el tamaño de tick de la cobertura.");
            bool isLong = trailing.SignedQuantity > 0;
            double previous = trailing.LastStopPrice;
            trailing.LastStopPrice = manualStopPrice;
            trailing.ActiveDistanceTicks = MimicalTrailingMath.RebasedDistanceTicks(isLong, trailing.BestPrice, manualStopPrice, tick);
            trailing.RestorePending = false;
            Log("TRAILING_MANUAL_STOP_ADOPTED", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName,
                trailing.StopOrder == null ? "" : trailing.StopOrder.OrderId, state.ToString(),
                trailing.StopOrder == null ? "" : trailing.StopOrder.OrderAction.ToString(),
                trailing.StopOrder == null ? "" : trailing.StopOrder.OrderType.ToString(),
                Math.Abs(trailing.SignedQuantity), trailing.StopOrder == null ? 0 : trailing.StopOrder.Filled, 0, manualStopPrice,
                "previous=" + previous.ToString("R", CultureInfo.InvariantCulture)
                + ";best=" + trailing.BestPrice.ToString("R", CultureInfo.InvariantCulture)
                + ";activeDistanceTicks=" + trailing.ActiveDistanceTicks.ToString(CultureInfo.InvariantCulture)
                + ";frequencyTicks=" + trailing.FrequencyTicks.ToString(CultureInfo.InvariantCulture));
            ShowTrailingStatus();
        }

        private void RequestAutomatedTrailingChange(int quantity, double stopPrice)
        {
            if (trailing == null || trailing.StopOrder == null) return;
            trailing.StopOrder.QuantityChanged = quantity;
            trailing.StopOrder.LimitPriceChanged = 0;
            trailing.StopOrder.StopPriceChanged = stopPrice;
            trailing.AutomatedChangePending = true;
            trailing.AutomatedTargetQuantity = quantity;
            trailing.AutomatedTargetStopPrice = stopPrice;
            try
            {
                trailing.Follower.Account.Change(new[] { trailing.StopOrder });
            }
            catch
            {
                trailing.AutomatedChangePending = false;
                throw;
            }
        }

        private IEnumerable<Link> CoverageExitLinks()
        {
            if (trailing == null || trailing.Follower == null || trailing.SignedQuantity == 0) return Enumerable.Empty<Link>();
            return followerLinks.Values.Where(l => l.Follower == trailing.Follower && ClosesPosition(l.Order.OrderAction, trailing.SignedQuantity));
        }

        private void CompleteTrailing(string reason)
        {
            if (trailing == null) return;
            TrailingCoverage completed = trailing;
            Log("TRAILING_COMPLETE", completed.Follower.Account.Name, completed.Follower.Instrument.FullName,
                completed.StopOrder == null ? "" : completed.StopOrder.OrderId, "", "", "", 0, 0, 0, completed.LastStopPrice, reason);
            detachedCoverageFollower = completed.Follower;
            ResetTrailing(true);
            mismatchSince.Remove(completed.Follower.Account.Name + "|" + completed.Follower.Instrument.FullName);
            Dispatcher.BeginInvoke(new Action(delegate
            {
                trailingButton.IsEnabled = false;
                trailingButton.Content = "TRAILING COMPLETADO";
                SetTrailingIndicator(0, "Trailing completado");
                trailingStateText.Text = "COMPLETADO · COBERTURA FLAT";
                trailingStateText.Foreground = ColorBrush(83, 206, 125);
            }));
        }

        private void ShowTrailingStatus()
        {
            if (trailing == null) return;
            string phase;
            if (trailing.Triggered)
                phase = "SIGUIENDO";
            else if (!trailing.Prepared)
                phase = "PREPARANDO";
            else if (trailing.ActivationPrice <= 0)
                phase = "ESPERA SL LÍDER";
            else
                phase = "ESPERA " + trailing.ActivationPrice.ToString("0.00", CultureInfo.InvariantCulture)
                    + " · SL " + trailing.LeaderStopPrice.ToString("0.00", CultureInfo.InvariantCulture)
                    + " + " + trailing.ActivationOffsetTicks.ToString(CultureInfo.InvariantCulture) + "t";
            string detail = phase + " · " + trailing.Follower.Account.Name;
            if (trailing.Triggered) detail += " · stop " + trailing.LastStopPrice.ToString("0.00", CultureInfo.InvariantCulture);
            Dispatcher.BeginInvoke(new Action(delegate
            {
                trailingStateText.Text = detail;
                trailingStateText.Foreground = trailing.Triggered ? Brushes.LimeGreen : Brushes.Orange;
                status.Text = "ACTIVO · TRAILING " + detail;
                status.Foreground = trailing.Triggered ? Brushes.LimeGreen : Brushes.Orange;
            }));
        }

        private static bool ClosesPosition(OrderAction action, int signedPosition)
        {
            if (signedPosition > 0) return action == OrderAction.Sell || action == OrderAction.SellShort;
            if (signedPosition < 0) return action == OrderAction.Buy || action == OrderAction.BuyToCover;
            return false;
        }

        private void OnOrder(object sender, OrderEventArgs e)
        {
            lock (gate)
            {
                if ((!armed && !flattening) || e.Order == null) return;
                Order order = e.Order;
                Log("ORDER", order.Account.Name, order.Instrument.FullName, order.OrderId, e.OrderState.ToString(), order.OrderAction.ToString(), order.OrderType.ToString(), e.Quantity, e.Filled, e.LimitPrice, e.StopPrice, e.Error + " " + e.Comment);
                if (flattening) return;
                if (trailing != null && order == trailing.StopOrder)
                {
                    try { HandleTrailingOrder(order, e); }
                    catch (Exception ex) { Trip("Error al gestionar la protección trailing: " + ex.Message); }
                    return;
                }
                if (trailing != null && order == trailing.RestoreTakeProfitOrder)
                {
                    try { CompleteNormalExitRestore(e); }
                    catch (Exception ex) { Trip("Error al restaurar las salidas normales: " + ex.Message); }
                    return;
                }
                Link inverseEntry;
                if (order.Account != leader && followerLinks.TryGetValue(order, out inverseEntry)
                    && IsInverseEntry(inverseEntry)
                    && e.Error == ErrorCode.UnableToChangeOrder
                    && (inverseEntry.Recovery != null || inverseEntry.LeaderOrder.Filled > 0
                        || InverseStopCrossed(inverseEntry, inverseEntry.DesiredStop)))
                {
                    try { BeginEntryRecovery(inverseEntry); }
                    catch (Exception ex) { Trip("Error al reemplazar entrada inversa: " + ex.Message); }
                    return;
                }
                if (order.Account != leader && order.Name.StartsWith("NODAL-", StringComparison.Ordinal)
                    && (e.OrderState == OrderState.Rejected || e.Error != ErrorCode.NoError))
                {
                    Trip("Error en copia de " + order.Account.Name + ": " + e.Error + " " + e.Comment);
                    return;
                }
                if (order.Account != leader)
                {
                    try
                    {
                        Link followerLink;
                        if (followerLinks.TryGetValue(order, out followerLink)) HandleFollowerOrder(followerLink, e);
                        if (trailing != null && trailing.Requested)
                        {
                            RefreshTrailingPosition();
                            TryPrepareTrailingProtection();
                        }
                    }
                    catch (Exception ex) { Trip("Error al gestionar orden seguidora: " + ex.Message); }
                    return;
                }
                if (order.Account != leader || order.Instrument.FullName != leaderInstrument.FullName || order.Name.StartsWith("NODAL-", StringComparison.Ordinal)) return;
                try
                {
                    // A confirmed exit ends any outstanding entry catch-up. It must
                    // never reopen the coverage after the leader has closed.
                    if (e.Filled > 0) SuppressOppositeEntryRecoveries(order);
                    ObserveEntryRecoveries(order, e.Filled);
                    TrackLeaderStopForTrailing(order, e);
                    if (e.OrderState == OrderState.Rejected || e.Error != ErrorCode.NoError)
                    {
                        CancelLinks(order);
                        Trip("Error en líder: " + e.Error + " " + e.Comment);
                        return;
                    }
                    if (e.OrderState == OrderState.CancelSubmitted || e.OrderState == OrderState.CancelPending || e.OrderState == OrderState.Cancelled)
                    {
                        // An ATM cancels the opposite OCO leg as soon as its peer fills.
                        // Cancelling the follower copy here can retire its entire OCO group
                        // before the follower close receives its own fill in a fast market.
                        // Let the follower OCO finish independently when this cancellation
                        // was caused by a filled leader peer.
                        if (HasFilledLeaderOcoPeer(order))
                            Log("OCO_PEER_FILLED_SKIP_CANCEL", order.Account.Name, order.Instrument.FullName,
                                order.OrderId, e.OrderState.ToString(), order.OrderAction.ToString(), order.OrderType.ToString(),
                                e.Quantity, e.Filled, e.LimitPrice, e.StopPrice,
                                "La pata opuesta del OCO líder ya fue ejecutada; se conserva el OCO seguidor hasta su propio cierre");
                        else
                            CancelLinks(order);
                        return;
                    }
                    if (e.OrderState == OrderState.Submitted)
                    {
                        if (IsClose(order)) FlattenFollowers("Cierre detectado en líder");
                        else
                        {
                            // La licencia decide sólo sobre el inicio de un ciclo nuevo.
                            // Salidas, flatten y protecciones de un ciclo en curso nunca se
                            // interrumpen por una baja o una falla de red.
                            bool startsNewCycle = SignedPosition(leader, leaderInstrument) == 0
                                && !links.Keys.Any(existing => existing != order && IsWorking(existing.OrderState));
                            if (startsNewCycle && !licenseAuthorized)
                            {
                                Trip("MIMICAL no está autorizado para iniciar un ciclo nuevo");
                                return;
                            }
                            CreateLinks(order, e.Quantity, e.LimitPrice, e.StopPrice);
                        }
                        return;
                    }
                    if (e.OrderState == OrderState.ChangeSubmitted || e.OrderState == OrderState.ChangePending)
                        ChangeLinks(order, e.Quantity, e.LimitPrice, e.StopPrice);
                }
                catch (Exception ex)
                {
                    Trip("Error al procesar orden líder " + order.Name + ": " + ex.Message);
                }
            }
        }

        private void HandleFollowerOrder(Link link, OrderEventArgs e)
        {
            if (link.Recovery != null)
            {
                link.Recovery.ObserveOriginal(e.Filled, IsTerminalState(e.OrderState));
                if (IsTerminalState(e.OrderState)) link.Terminal = true;
                SubmitEntryRecovery(link);
                return;
            }
            if (link.Terminal) return;
            if (e.OrderState == OrderState.Cancelled || e.OrderState == OrderState.Filled || e.OrderState == OrderState.Rejected)
            {
                link.Terminal = true;
                link.RestorePending = false;
                link.LocalOverrideActive = false;
                return;
            }
            if (e.OrderState != OrderState.Accepted && e.OrderState != OrderState.Working) return;

            bool matches = e.Quantity == link.DesiredQuantity
                && Same(e.LimitPrice, link.DesiredLimit)
                && Same(e.StopPrice, link.DesiredStop);
            if (matches)
            {
                if (link.RestorePending)
                    Log("FOLLOWER_RESYNCED_FROM_LEADER", link.Follower.Account.Name, link.Follower.Instrument.FullName, link.Order.OrderId, e.OrderState.ToString(), link.Order.OrderAction.ToString(), link.Order.OrderType.ToString(), e.Quantity, e.Filled, e.LimitPrice, e.StopPrice, "leader=" + link.LeaderOrder.OrderId);
                link.RestorePending = false;
                link.LocalOverrideActive = false;
                return;
            }
            // Replikanto behavior: a manual change made directly on a follower stays local.
            // It must not propagate to the other accounts and must not be reverted immediately.
            // The next ChangeSubmitted from the leader calls ChangeLinks and resynchronizes it.
            if (link.RestorePending) return;
            if (link.LocalOverrideActive) return;
            link.LocalOverrideActive = true;
            Log("FOLLOWER_LOCAL_CHANGE", link.Follower.Account.Name, link.Follower.Instrument.FullName, link.Order.OrderId, e.OrderState.ToString(), link.Order.OrderAction.ToString(), link.Order.OrderType.ToString(), e.Quantity, e.Filled, e.LimitPrice, e.StopPrice, "leader=" + link.LeaderOrder.OrderId + ";expectedQty=" + link.DesiredQuantity + ";expectedLimit=" + link.DesiredLimit.ToString(CultureInfo.InvariantCulture) + ";expectedStop=" + link.DesiredStop.ToString(CultureInfo.InvariantCulture));
        }

        private static bool IsTerminalState(OrderState state)
        {
            return state == OrderState.Cancelled || state == OrderState.Filled || state == OrderState.Rejected;
        }

        private static bool IsInverseEntry(Link link)
        {
            return !link.IsRecoveryOrder && link.Follower.Ratio < 0
                && link.LeaderOrder.OrderType == OrderType.Limit
                && link.Order.OrderType == OrderType.StopMarket
                && String.IsNullOrWhiteSpace(link.LeaderOrder.Oco) && !IsClose(link.LeaderOrder);
        }

        private static bool InverseStopCrossed(Link link, double stop)
        {
            MarketData data = link.Follower.Instrument.MarketData;
            if (data == null) return false;
            return MimicalEntryRecovery.StopIsCrossed(
                link.Order.OrderAction == OrderAction.Buy || link.Order.OrderAction == OrderAction.BuyToCover,
                stop, data.Last == null ? 0 : data.Last.Price,
                data.Bid == null ? 0 : data.Bid.Price, data.Ask == null ? 0 : data.Ask.Price);
        }

        private void BeginEntryRecovery(Link link)
        {
            if (link.Recovery == null)
            {
                link.Recovery = new MimicalEntryRecovery();
                link.RestorePending = false;
                link.LocalOverrideActive = false;
                Log("INVERSE_ENTRY_RECOVERY", link.Follower.Account.Name, link.Follower.Instrument.FullName,
                    link.Order.OrderId, link.Order.OrderState.ToString(), link.Order.OrderAction.ToString(),
                    link.Order.OrderType.ToString(), link.DesiredQuantity, link.Order.Filled, 0, link.DesiredStop,
                    "Esperar cancelación confirmada y copiar sólo fills de líder=" + link.LeaderOrder.OrderId);
            }
            link.Recovery.ObserveLeader(link.LeaderOrder.Filled);
            link.Recovery.ObserveOriginal(link.Order.Filled, IsTerminalState(link.Order.OrderState));
            if (link.Recovery.OriginalTerminal) link.Terminal = true;
            else if (!link.CancelRequested)
            {
                link.CancelRequested = true;
                link.Follower.Account.Cancel(new[] { link.Order });
            }
            SubmitEntryRecovery(link);
        }

        private void ObserveEntryRecoveries(Order source, int filled)
        {
            List<Link> group;
            if (!links.TryGetValue(source, out group)) return;
            foreach (Link link in group.Where(l => l.Recovery != null).ToArray())
            {
                link.Recovery.ObserveLeader(filled);
                SubmitEntryRecovery(link);
            }
        }

        private void SubmitEntryRecovery(Link original)
        {
            if (!armed || flattening) return;
            int quantity = original.Recovery.ReserveNext(original.Follower.Ratio);
            if (quantity == 0) return;
            // Reserve before Submit: NinjaTrader may call OnOrder synchronously.
            // On failure do not retry blindly; the normal error handler blocks.
            Order copy = original.Follower.Account.CreateOrder(original.Follower.Instrument,
                original.Order.OrderAction, OrderType.Market, OrderEntry.Manual, original.LeaderOrder.TimeInForce,
                quantity, 0, 0, String.Empty, "NODAL-CROSS-" + Guid.NewGuid().ToString("N").Substring(0, 8), Core.Globals.MaxDate, null);
            Link replacement = new Link { LeaderOrder = original.LeaderOrder, Follower = original.Follower,
                Order = copy, DesiredQuantity = quantity, IsRecoveryOrder = true };
            links[original.LeaderOrder].Add(replacement);
            followerLinks.Add(copy, replacement);
            original.Follower.Account.Submit(new[] { copy });
            Log("INVERSE_ENTRY_MARKET_SUBMIT", original.Follower.Account.Name, original.Follower.Instrument.FullName,
                copy.OrderId, copy.OrderState.ToString(), copy.OrderAction.ToString(), copy.OrderType.ToString(),
                quantity, copy.Filled, 0, 0, "leaderFilled=" + original.Recovery.LeaderFilled
                + ";originalFilled=" + original.Recovery.OriginalFilled + ";reserved=" + original.Recovery.Reserved);
        }

        private void SuppressOppositeEntryRecoveries(Order source)
        {
            if (source.Account != leader || source.Instrument.FullName != leaderInstrument.FullName) return;
            bool sourceBuy = source.OrderAction == OrderAction.Buy || source.OrderAction == OrderAction.BuyToCover;
            foreach (Link link in followerLinks.Values.Where(l => l.Recovery != null).ToArray())
            {
                bool entryBuy = link.LeaderOrder.OrderAction == OrderAction.Buy || link.LeaderOrder.OrderAction == OrderAction.BuyToCover;
                if (entryBuy != sourceBuy) link.Recovery.Suppressed = true;
            }
        }

        private void CreateLinks(Order leaderOrder, int quantity, double limit, double stop)
        {
            if (links.ContainsKey(leaderOrder)) return;
            List<Link> group = new List<Link>();
            List<CopyPlan> plans = new List<CopyPlan>();
            foreach (FollowerConfig follower in followers)
            {
                if (follower == detachedCoverageFollower)
                {
                    Log("TRAILING_DETACHED_SKIP", follower.Account.Name, follower.Instrument.FullName, leaderOrder.OrderId,
                        "", leaderOrder.OrderAction.ToString(), leaderOrder.OrderType.ToString(), 0, 0, limit, stop,
                        "La cobertura ya cerró por trailing; permanece separada hasta que todo el grupo quede Flat");
                    continue;
                }
                int followerQuantity = Quantity(quantity, follower.Ratio);
                if (followerQuantity == 0)
                {
                    decimal raw = quantity * follower.Ratio;
                    string detail = "leaderQty=" + quantity.ToString(CultureInfo.InvariantCulture)
                        + ";ratio=" + follower.Ratio.ToString(CultureInfo.InvariantCulture)
                        + ";raw=" + raw.ToString(CultureInfo.InvariantCulture);
                    Log("SKIP_ZERO", follower.Account.Name, follower.Instrument.FullName, leaderOrder.OrderId, "", "", "", 0, 0, 0, 0, detail);
                    ShowZeroQuantity(follower, quantity, raw);
                    continue;
                }
                OrderAction action;
                OrderType type;
                double followerLimit;
                double followerStop;
                Transform(leaderOrder, follower, limit, stop, out action, out type, out followerLimit, out followerStop);
                string oco = MapOco(leaderOrder.Oco, follower.Account);
                string name = "NODAL-" + Guid.NewGuid().ToString("N").Substring(0, 8) + "-" + SafeName(leaderOrder.Name);
                Order copy = follower.Account.CreateOrder(follower.Instrument, action, type, OrderEntry.Manual, leaderOrder.TimeInForce, followerQuantity, followerLimit, followerStop, oco, name, Core.Globals.MaxDate, null);
                Link link = new Link { LeaderOrder = leaderOrder, Follower = follower, Order = copy, DesiredQuantity = followerQuantity, DesiredLimit = followerLimit, DesiredStop = followerStop };
                group.Add(link);
                plans.Add(new CopyPlan { Follower = follower, Link = link, Action = action, Type = type });
            }

            // Nothing is submitted until every follower transformation and order object is valid.
            links.Add(leaderOrder, group);
            foreach (Link link in group) followerLinks.Add(link.Order, link);
            List<CopyPlan> submitted = new List<CopyPlan>();
            try
            {
                foreach (CopyPlan plan in plans)
                {
                    plan.Follower.Account.Submit(new[] { plan.Link.Order });
                    submitted.Add(plan);
                    Log("SUBMIT_COPY", plan.Follower.Account.Name, plan.Follower.Instrument.FullName, plan.Link.Order.OrderId, plan.Link.Order.OrderState.ToString(), plan.Action.ToString(), plan.Type.ToString(), plan.Link.DesiredQuantity, 0, plan.Link.DesiredLimit, plan.Link.DesiredStop, "leader=" + leaderOrder.OrderId + ";ratio=" + plan.Follower.Ratio.ToString(CultureInfo.InvariantCulture));
                }
            }
            catch
            {
                foreach (CopyPlan plan in submitted)
                {
                    try
                    {
                        if (IsWorking(plan.Link.Order.OrderState)) plan.Follower.Account.Cancel(new[] { plan.Link.Order });
                    }
                    catch (Exception cancelError)
                    {
                        Log("ROLLBACK_CANCEL_ERROR", plan.Follower.Account.Name, plan.Follower.Instrument.FullName, plan.Link.Order.OrderId, plan.Link.Order.OrderState.ToString(), plan.Link.Order.OrderAction.ToString(), plan.Link.Order.OrderType.ToString(), plan.Link.Order.Quantity, plan.Link.Order.Filled, plan.Link.Order.LimitPrice, plan.Link.Order.StopPrice, cancelError.Message);
                    }
                }
                throw;
            }
        }

        private void ChangeLinks(Order leaderOrder, int quantity, double limit, double stop)
        {
            List<Link> group;
            if (!links.TryGetValue(leaderOrder, out group)) return;
            foreach (Link link in group.Where(l => !l.Terminal && IsWorking(l.Order.OrderState)).ToArray())
            {
                if (link.IsRecoveryOrder || link.Recovery != null) continue;
                int followerQuantity = Quantity(quantity, link.Follower.Ratio);
                if (followerQuantity == 0)
                {
                    link.Follower.Account.Cancel(new[] { link.Order });
                    link.Terminal = true;
                    continue;
                }
                OrderAction unusedAction;
                OrderType unusedType;
                double followerLimit;
                double followerStop;
                Transform(leaderOrder, link.Follower, limit, stop, out unusedAction, out unusedType, out followerLimit, out followerStop);
                if (IsInverseEntry(link) && InverseStopCrossed(link, followerStop))
                {
                    link.DesiredQuantity = followerQuantity;
                    link.DesiredStop = followerStop;
                    BeginEntryRecovery(link);
                    continue;
                }
                int followerSignedPosition = SignedPosition(link.Follower.Account, link.Follower.Instrument);
                bool equivalentClosingSide = followerSignedPosition != 0
                    && ClosesPosition(link.Order.OrderAction, followerSignedPosition)
                    && ClosesPosition(unusedAction, followerSignedPosition);
                if (link.Order.OrderType != unusedType || (link.Order.OrderAction != unusedAction && !equivalentClosingSide))
                    throw new InvalidOperationException("El cambio requiere reemplazar tipo o lado; se bloqueó.");
                if (link.DesiredQuantity == followerQuantity && Same(link.DesiredLimit, followerLimit) && Same(link.DesiredStop, followerStop) && !link.LocalOverrideActive) continue;
                int previousQuantity = link.DesiredQuantity;
                double previousLimit = link.DesiredLimit;
                double previousStop = link.DesiredStop;
                bool previousLocalOverride = link.LocalOverrideActive;
                link.DesiredQuantity = followerQuantity;
                link.DesiredLimit = followerLimit;
                link.DesiredStop = followerStop;
                link.RestorePending = true;
                link.LocalOverrideActive = false;
                try
                {
                    link.Order.QuantityChanged = followerQuantity;
                    link.Order.LimitPriceChanged = followerLimit;
                    link.Order.StopPriceChanged = followerStop;
                    link.Follower.Account.Change(new[] { link.Order });
                }
                catch
                {
                    link.DesiredQuantity = previousQuantity;
                    link.DesiredLimit = previousLimit;
                    link.DesiredStop = previousStop;
                    link.RestorePending = false;
                    link.LocalOverrideActive = previousLocalOverride;
                    throw;
                }
                Log("CHANGE_COPY", link.Follower.Account.Name, link.Follower.Instrument.FullName, link.Order.OrderId, link.Order.OrderState.ToString(), link.Order.OrderAction.ToString(), link.Order.OrderType.ToString(), followerQuantity, link.Order.Filled, followerLimit, followerStop, "leader=" + leaderOrder.OrderId + ";localOverride=" + previousLocalOverride);
            }
        }

        private void CancelLinks(Order leaderOrder)
        {
            List<Link> group;
            if (!links.TryGetValue(leaderOrder, out group)) return;
            foreach (Link link in group.Where(l => !l.Terminal).ToArray())
            {
                // Cancellation of an unfilled leader remainder must not cancel
                // coverage already reserved for its confirmed partial fills.
                if (link.IsRecoveryOrder) continue;
                if (link.Recovery != null)
                {
                    if (!link.CancelRequested && IsWorking(link.Order.OrderState))
                    {
                        link.CancelRequested = true;
                        link.Follower.Account.Cancel(new[] { link.Order });
                    }
                    continue;
                }
                if (IsWorking(link.Order.OrderState)) link.Follower.Account.Cancel(new[] { link.Order });
                link.Terminal = true;
                Log("CANCEL_COPY", link.Follower.Account.Name, link.Follower.Instrument.FullName, link.Order.OrderId, link.Order.OrderState.ToString(), link.Order.OrderAction.ToString(), link.Order.OrderType.ToString(), link.Order.Quantity, link.Order.Filled, link.Order.LimitPrice, link.Order.StopPrice, "leader=" + leaderOrder.OrderId);
            }
        }

        private bool HasFilledLeaderOcoPeer(Order leaderOrder)
        {
            if (leaderOrder == null || String.IsNullOrWhiteSpace(leaderOrder.Oco)) return false;
            return links.Keys.Any(peer => peer != leaderOrder
                && peer.Account == leaderOrder.Account
                && peer.Instrument.FullName == leaderOrder.Instrument.FullName
                && String.Equals(peer.Oco, leaderOrder.Oco, StringComparison.Ordinal)
                && peer.OrderState == OrderState.Filled);
        }

        private void OnExecution(object sender, ExecutionEventArgs e)
        {
            lock (gate)
            {
                if ((!armed && !flattening) || e.Execution == null) return;
                Execution x = e.Execution;
                Log("EXECUTION", x.Account.Name, x.Instrument.FullName, x.Order == null ? "" : x.Order.OrderId, "", x.Order == null ? "" : x.Order.OrderAction.ToString(), x.Order == null ? "" : x.Order.OrderType.ToString(), e.Quantity, 0, e.Price, 0, "execution=" + x.ExecutionId);
            }
        }

        private void OnPosition(object sender, PositionEventArgs e)
        {
            lock (gate)
            {
                if ((!armed && !flattening) || e.Position == null) return;
                Log("POSITION", e.Position.Account.Name, e.Position.Instrument.FullName, "", e.MarketPosition.ToString(), "", "", e.Quantity, 0, e.AveragePrice, 0, "");
                if (armed && trailing != null && e.Position.Account == trailing.Follower.Account
                    && e.Position.Instrument.FullName == trailing.Follower.Instrument.FullName)
                {
                    try
                    {
                        RefreshTrailingPosition();
                        if (trailing != null)
                        {
                            TryPrepareTrailingProtection();
                            AdjustTrailingQuantity();
                        }
                    }
                    catch (Exception ex) { Trip("Error de posición en trailing: " + ex.Message); }
                }
                if (armed && trailing != null && trailing.HadPosition && e.Position.Account == leader
                    && e.Position.Instrument.FullName == leaderInstrument.FullName
                    && e.MarketPosition == MarketPosition.Flat)
                {
                    Dispatcher.BeginInvoke(new Action(delegate
                    {
                        trailingButton.IsEnabled = false;
                        trailingButton.Content = trailing.Triggered ? "TRAILING SIGUIENDO" : "TRAILING BLOQUEADO";
                    }));
                }
            }
        }

        private void AdjustTrailingQuantity()
        {
            if (trailing == null || !trailing.Prepared || trailing.StopOrder == null || trailing.SignedQuantity == 0 || !IsWorking(trailing.StopOrder.OrderState) || trailing.AutomatedChangePending || trailing.ManualChangePending) return;
            int quantity = Math.Abs(trailing.SignedQuantity);
            if (trailing.StopOrder.Quantity == quantity) return;
            trailing.RestorePending = false;
            RequestAutomatedTrailingChange(quantity, trailing.LastStopPrice);
            Log("TRAILING_QUANTITY", trailing.Follower.Account.Name, trailing.Follower.Instrument.FullName, trailing.StopOrder.OrderId,
                trailing.StopOrder.OrderState.ToString(), trailing.StopOrder.OrderAction.ToString(), trailing.StopOrder.OrderType.ToString(), quantity,
                trailing.StopOrder.Filled, 0, trailing.LastStopPrice, "posición de cobertura actualizada");
        }

        private void QueueReconcile()
        {
            // Account.Positions and Account.Orders are maintained by NinjaTrader's
            // provider threads. Never wait on those collections from the WPF thread:
            // doing so can freeze the whole control panel while an account update is
            // being delivered. Only one background reconciliation may run at a time.
            if (Interlocked.CompareExchange(ref reconciliationRunning, 1, 0) != 0) return;
            ThreadPool.QueueUserWorkItem(delegate
            {
                try { Reconcile(); }
                catch (Exception ex)
                {
                    lock (gate)
                    {
                        if (armed || flattening) Trip("Error de conciliación: " + ex.Message);
                    }
                }
                finally { Interlocked.Exchange(ref reconciliationRunning, 0); }
            });
        }

        private void Reconcile()
        {
            bool wasFlattening;
            bool wasArmed;
            Account leaderSnapshot;
            Instrument leaderInstrumentSnapshot;
            FollowerConfig[] followerSnapshot;
            TrailingCoverage trailingSnapshot;
            FollowerConfig detachedCoverageSnapshot;

            // Copy only references/state while holding the copier lock. Account
            // collections are read below, after the lock has been released, so an
            // account event can never form a lock cycle with reconciliation.
            lock (gate)
            {
                wasFlattening = flattening;
                wasArmed = armed;
                leaderSnapshot = leader;
                leaderInstrumentSnapshot = leaderInstrument;
                followerSnapshot = followers.ToArray();
                trailingSnapshot = trailing;
                detachedCoverageSnapshot = detachedCoverageFollower;
                if (!wasFlattening && !wasArmed && !configurationPending) return;
            }

            if (!wasFlattening && !wasArmed)
            {
                if (leaderSnapshot != null && leaderInstrumentSnapshot != null
                    && followerSnapshot.Length > 0
                    && AllFlatAndClear(leaderSnapshot, leaderInstrumentSnapshot, followerSnapshot))
                    Dispatcher.BeginInvoke(new Action(RearmForConfiguration));
                return;
            }

            if (wasFlattening)
            {
                if (!AllFlatAndClear(leaderSnapshot, leaderInstrumentSnapshot, followerSnapshot)) return;
                lock (gate)
                {
                    if (!flattening) return;
                    flattening = false;
                    Log("FLATTEN_CONFIRMED", "", "", "", "", "", "", 0, 0, 0, 0, "Flat y cero órdenes activas en todo el grupo");
                }
                Dispatcher.BeginInvoke(new Action(delegate
                {
                    Stop("FLAT CONFIRMADO en todo el grupo");
                    configurationPending = true;
                    ScheduleConfigurationApply();
                }));
                return;
            }

            int leaderSigned = SignedPosition(leaderSnapshot, leaderInstrumentSnapshot);
            if (detachedCoverageSnapshot != null && AllFlatAndClear(leaderSnapshot, leaderInstrumentSnapshot, followerSnapshot))
            {
                bool resetDetached = false;
                lock (gate)
                {
                    if (armed && detachedCoverageFollower == detachedCoverageSnapshot)
                    {
                        detachedCoverageFollower = null;
                        mismatchSince.Remove(detachedCoverageSnapshot.Account.Name + "|" + detachedCoverageSnapshot.Instrument.FullName);
                        Log("TRAILING_CYCLE_RESET", detachedCoverageSnapshot.Account.Name, detachedCoverageSnapshot.Instrument.FullName,
                            "", "", "", "", 0, 0, 0, 0, "Todo el grupo quedó Flat; cobertura disponible para el próximo ciclo");
                        resetDetached = true;
                    }
                }
                if (resetDetached)
                {
                    detachedCoverageSnapshot = null;
                    Dispatcher.BeginInvoke(new Action(delegate
                    {
                        trailingButton.IsEnabled = armed;
                        trailingButton.Content = "ACTIVAR TRAILING";
                        SetTrailingIndicator(0, "Trailing desactivado");
                        trailingStateText.Text = "NORMAL";
                        trailingStateText.Foreground = Brushes.DarkGray;
                    }));
                }
            }
            if (configurationPending && AllFlatAndClear(leaderSnapshot, leaderInstrumentSnapshot, followerSnapshot))
            {
                Dispatcher.BeginInvoke(new Action(RearmForConfiguration));
                return;
            }
            DateTime now = DateTime.UtcNow;
            List<ReconcileCheck> checks = new List<ReconcileCheck>();
            foreach (FollowerConfig follower in followerSnapshot)
            {
                if ((trailingSnapshot != null && trailingSnapshot.Requested && trailingSnapshot.HadPosition && follower == trailingSnapshot.Follower)
                    || follower == detachedCoverageSnapshot)
                {
                    checks.Add(new ReconcileCheck
                    {
                        Follower = follower,
                        Expected = Int32.MinValue,
                        Actual = Int32.MinValue,
                        Key = follower.Account.Name + "|" + follower.Instrument.FullName
                    });
                    continue;
                }
                checks.Add(new ReconcileCheck
                {
                    Follower = follower,
                    Expected = checked((int)decimal.Truncate(leaderSigned * follower.Ratio)),
                    Actual = SignedPosition(follower.Account, follower.Instrument),
                    Key = follower.Account.Name + "|" + follower.Instrument.FullName
                });
            }

            lock (gate)
            {
                if (!armed || leader != leaderSnapshot || leaderInstrument != leaderInstrumentSnapshot) return;
                foreach (ReconcileCheck check in checks)
                {
                    if (check.Expected == Int32.MinValue || check.Expected == check.Actual)
                    {
                        mismatchSince.Remove(check.Key);
                        continue;
                    }
                    DateTime since;
                    if (!mismatchSince.TryGetValue(check.Key, out since))
                    {
                        mismatchSince[check.Key] = now;
                        Log("MISMATCH_GRACE", check.Follower.Account.Name, check.Follower.Instrument.FullName, "", "", "", "", 0, 0, 0, 0, "expected=" + check.Expected + ";actual=" + check.Actual);
                    }
                    else if ((now - since).TotalSeconds >= 2)
                    {
                        Trip("DESINCRONIZACIÓN: " + check.Follower.Account.Name + " " + check.Follower.Instrument.FullName + " esperado " + check.Expected + ", real " + check.Actual);
                        return;
                    }
                }
            }
        }

        private void Trip(string reason)
        {
            armed = false;
            configurationPending = true;
            Log("BLOCKED", "", "", "", "", "", "", 0, 0, 0, 0, reason);
            SetStatus("BLOQUEADO · " + reason + " · usá Flatten grupo y revisá posiciones", Brushes.Red);
            Dispatcher.BeginInvoke(new Action(delegate
            {
                UpdateFollowerStates("Bloqueado", Brushes.Red);
                flattenButton.IsEnabled = true;
            }));
        }

        private void ShowZeroQuantity(FollowerConfig follower, int leaderQuantity, decimal raw)
        {
            string ratio = follower.Ratio.ToString(CultureInfo.InvariantCulture);
            string calculation = leaderQuantity.ToString(CultureInfo.InvariantCulture) + " × " + ratio + " = " + raw.ToString(CultureInfo.InvariantCulture) + " → 0";
            Dispatcher.BeginInvoke(new Action(delegate
            {
                if (follower.Choice != null)
                {
                    follower.Choice.State.Text = "OMITIDO · 0";
                    follower.Choice.State.Foreground = Brushes.Orange;
                    follower.Choice.State.ToolTip = calculation;
                }
                status.Text = "ATENCIÓN · " + follower.Account.Name + " OMITIDO (0 contratos)";
                status.Foreground = Brushes.Orange;
                status.ToolTip = calculation;
            }));
        }

        private void FlattenGroup()
        {
            DiagnosticTrace("FLATTEN_CLICK_ENTRY");
            bool entered = false;
            try
            {
                entered = Monitor.TryEnter(gate, 2000);
                if (!entered)
                {
                    DiagnosticTrace("FLATTEN_GATE_TIMEOUT");
                    status.Text = "FLATTEN PENDIENTE · el motor está procesando un evento; reintentá en un instante";
                    status.Foreground = Brushes.Orange;
                    return;
                }
                DiagnosticTrace("FLATTEN_GATE_ACQUIRED");
                flattening = true;
                armed = false;
                try
                {
                    if (leader != null) { RequireAccountPresent(leader); leader.Flatten(new[] { leaderInstrument }); }
                    foreach (FollowerConfig follower in followers)
                    {
                        RequireAccountPresent(follower.Account);
                        follower.Account.Flatten(new[] { follower.Instrument });
                    }
                    Log("FLATTEN_GROUP", "", "", "", "", "", "", 0, 0, 0, 0, "solicitud enviada; verificar Flat y cero órdenes");
                    SetStatus("FLATTEN SOLICITADO · esperando confirmaciones; verificá Flat y cero órdenes", Brushes.Orange);
                }
                catch (Exception ex)
                {
                    SetStatus("ERROR FLATTEN · " + ex.Message, Brushes.Red);
                }
            }
            finally
            {
                if (entered) Monitor.Exit(gate);
            }
        }

        private void FlattenFollowers(string reason)
        {
            foreach (Link link in followerLinks.Values.Where(l => l.Recovery != null)) link.Recovery.Suppressed = true;
            foreach (FollowerConfig follower in followers)
            {
                RequireAccountPresent(follower.Account);
                follower.Account.Flatten(new[] { follower.Instrument });
                Log("FLATTEN_FOLLOWER", follower.Account.Name, follower.Instrument.FullName, "", "", "", "", 0, 0, 0, 0, reason);
            }
        }

        private void Transform(Order source, FollowerConfig follower, double limit, double stop, out OrderAction action, out OrderType type, out double targetLimit, out double targetStop)
        {
            targetLimit = limit;
            targetStop = stop;
            if (follower.Ratio > 0)
            {
                action = source.OrderAction;
                type = source.OrderType;
                return;
            }
            action = InverseAction(source.OrderAction, follower.Account, follower.Instrument);
            if (source.OrderType == OrderType.Market)
            {
                type = OrderType.Market; targetLimit = 0; targetStop = 0; return;
            }
            if (source.OrderType == OrderType.Limit)
            {
                type = OrderType.StopMarket; targetLimit = 0; targetStop = limit; return;
            }
            if (source.OrderType == OrderType.StopMarket)
            {
                type = OrderType.Limit; targetLimit = stop; targetStop = 0; return;
            }
            if (source.OrderType == OrderType.StopLimit && Same(limit, stop))
            {
                type = OrderType.Limit; targetLimit = stop; targetStop = 0; return;
            }
            throw new NotSupportedException("Combinación inversa no validada: " + source.OrderType + " limit=" + limit + " stop=" + stop);
        }

        private static OrderAction InverseAction(OrderAction source, Account follower, Instrument instrument)
        {
            if (source == OrderAction.Buy || source == OrderAction.BuyToCover) return OrderAction.SellShort;
            if (source == OrderAction.Sell || source == OrderAction.SellShort)
                return SignedPosition(follower, instrument) < 0 ? OrderAction.BuyToCover : OrderAction.Buy;
            throw new NotSupportedException("Acción no soportada: " + source);
        }

        private void RequireCleanStart()
        {
            List<string> problems = new List<string>();
            if (SignedPosition(leader, leaderInstrument) != 0 || ActiveOrders(leader, leaderInstrument).Any()) problems.Add(leader.Name);
            foreach (FollowerConfig follower in followers)
                if (SignedPosition(follower.Account, follower.Instrument) != 0 || ActiveOrders(follower.Account, follower.Instrument).Any()) problems.Add(follower.Account.Name);
            if (problems.Count > 0) throw new InvalidOperationException("El inicio exige Flat y cero órdenes activas: " + String.Join(", ", problems.Distinct()));
        }

        private static bool AllFlatAndClear(Account leaderAccount, Instrument leaderInstrumentValue, IEnumerable<FollowerConfig> followerValues)
        {
            if (leaderAccount == null || leaderInstrumentValue == null) return false;
            if (SignedPosition(leaderAccount, leaderInstrumentValue) != 0 || ActiveOrders(leaderAccount, leaderInstrumentValue).Any()) return false;
            foreach (FollowerConfig follower in followerValues)
                if (SignedPosition(follower.Account, follower.Instrument) != 0 || ActiveOrders(follower.Account, follower.Instrument).Any()) return false;
            return true;
        }

        private static IEnumerable<Order> ActiveOrders(Account account, Instrument instrument)
        {
            lock (account.Orders)
                return account.Orders.Where(o => o.Instrument.FullName == instrument.FullName && IsWorking(o.OrderState)).ToArray();
        }

        private static int SignedPosition(Account account, Instrument instrument)
        {
            Position position = FindPosition(account, instrument);
            if (position == null || position.MarketPosition == MarketPosition.Flat) return 0;
            return position.MarketPosition == MarketPosition.Long ? position.Quantity : -position.Quantity;
        }

        private static Position FindPosition(Account account, Instrument instrument)
        {
            lock (account.Positions)
                return account.Positions.FirstOrDefault(p => p.Instrument.FullName == instrument.FullName);
        }

        private static bool IsWorking(OrderState state)
        {
            return state == OrderState.Initialized || state == OrderState.Submitted || state == OrderState.Accepted || state == OrderState.Working || state == OrderState.PartFilled || state == OrderState.TriggerPending || state == OrderState.Suspended || state == OrderState.AcceptedByRisk || state == OrderState.ChangeSubmitted || state == OrderState.ChangePending || state == OrderState.CancelSubmitted || state == OrderState.CancelPending;
        }

        private static bool IsClose(Order order)
        {
            string name = (order.Name ?? "").Trim().ToLowerInvariant();
            return name == "cerrar" || name == "close" || name.Contains("flatten");
        }

        private static int Quantity(int leaderQuantity, decimal ratio)
        {
            return checked((int)decimal.Truncate(Math.Abs(leaderQuantity * ratio)));
        }

        private static string CrossOrderInstrumentName(string leaderFullName)
        {
            if (String.IsNullOrWhiteSpace(leaderFullName) || !leaderFullName.StartsWith("NQ ", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Cross Order está validado únicamente para NQ → MNQ.");
            return "MNQ " + leaderFullName.Substring(3);
        }

        private static string SafeName(string value)
        {
            string text = String.IsNullOrWhiteSpace(value) ? "Order" : value.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
            return text.Length <= 24 ? text : text.Substring(0, 24);
        }

        private string MapOco(string leaderOco, Account follower)
        {
            if (String.IsNullOrWhiteSpace(leaderOco)) return String.Empty;
            string key = follower.Name + "|" + leaderOco;
            string mapped;
            if (!ocoByFollower.TryGetValue(key, out mapped))
            {
                mapped = Guid.NewGuid().ToString("N");
                ocoByFollower.Add(key, mapped);
            }
            return mapped;
        }

        private static Account FindAccount(string name)
        {
            lock (Account.All)
            {
                Account result = Account.All.FirstOrDefault(a => a.Name == name && a.Connection != null && a.Connection.Status == ConnectionStatus.Connected);
                if (result == null) throw new InvalidOperationException("Cuenta no encontrada: " + name);
                return result;
            }
        }

        private static Instrument FindInstrument(string fullName)
        {
            if (String.IsNullOrWhiteSpace(fullName)) throw new InvalidOperationException("Instrumento vacío.");
            lock (Instrument.All)
            {
                Instrument result = Instrument.All.FirstOrDefault(i => i.FullName.Equals(fullName, StringComparison.OrdinalIgnoreCase));
                if (result != null) return result;
            }
            Instrument loaded = Instrument.GetInstrument(fullName, false);
            if (loaded == null) throw new InvalidOperationException("Instrumento no encontrado: " + fullName);
            return loaded;
        }

        private static void RequireAccountPresent(Account account)
        {
            if (account == null || account.Connection == null || account.Connection.Status != ConnectionStatus.Connected)
                throw new InvalidOperationException("La cuenta seleccionada no está conectada en NinjaTrader.");
        }

        private static bool Same(double left, double right)
        {
            return Math.Abs(left - right) < 0.0000001;
        }

        private void Log(string kind, string account, string instrument, string orderId, string state, string action, string type, int quantity, int filled, double limit, double stop, string detail)
        {
            string line = String.Join("\t", new[]
            {
                DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture), kind, Cell(account), Cell(instrument), Cell(orderId), Cell(state), Cell(action), Cell(type),
                quantity.ToString(CultureInfo.InvariantCulture), filled.ToString(CultureInfo.InvariantCulture), limit.ToString("R", CultureInfo.InvariantCulture), stop.ToString("R", CultureInfo.InvariantCulture), Cell(detail)
            });
            if (writer != null) { writer.WriteLine(line); writer.Flush(); }
            Dispatcher.BeginInvoke(new Action(delegate { lastActivity.Text = FriendlyEvent(kind, account, state, detail); }));
        }

        private static void DiagnosticTrace(string message)
        {
            try
            {
                string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NodalBots", "Mimical");
                Directory.CreateDirectory(directory);
                File.AppendAllText(Path.Combine(directory, "diagnostic.log"),
                    DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + "\t" + message + Environment.NewLine);
            }
            catch { }
        }

        private static string FriendlyEvent(string kind, string account, string state, string detail)
        {
            if (kind == "CONFIG") return "Configuración armada y registro iniciado";
            if (kind == "FOLLOWER_CONFIG") return account + " configurada en " + detail;
            if (kind == "SKIP_ZERO") return account + " omitido: el ratio dio 0 contratos · " + detail.Replace(';', ' ');
            if (kind == "SUBMIT_COPY") return "Orden copiada a " + account;
            if (kind == "CHANGE_COPY") return "Cambio replicado en " + account;
            if (kind == "CANCEL_COPY") return "Cancelación replicada en " + account;
            if (kind == "EXECUTION") return "Ejecución recibida en " + account;
            if (kind == "POSITION") return "Posición actualizada en " + account;
            if (kind == "MISMATCH_GRACE") return "Sincronizando " + account;
            if (kind == "FLATTEN_GROUP") return "Flatten enviado; esperando confirmación";
            if (kind == "FLATTEN_CONFIRMED") return "Grupo Flat y sin órdenes activas";
            if (kind == "BLOCKED") return "Copiador bloqueado: " + detail;
            if (kind == "TRAILING_REQUESTED") return "Trailing solicitado en " + account;
            if (kind == "TRAILING_ANCHOR_UPDATED") return "Activación actualizada desde el SL líder en " + account;
            if (kind == "TRAILING_PROTECTION_SUBMIT") return "Creando protección independiente en " + account;
            if (kind == "TRAILING_PREPARED") return "Protección independiente activa en " + account;
            if (kind == "TRAILING_TRIGGERED") return "Trailing disparado en " + account;
            if (kind == "TRAILING_MOVE") return "Trailing avanzó en " + account;
            if (kind == "TRAILING_EXIT_FILLED") return "Trailing cerró la cobertura en " + account;
            if (kind == "TRAILING_COMPLETE") return "Trailing completado en " + account;
            if (kind == "ORDER" && !String.IsNullOrWhiteSpace(account)) return "Orden " + state + " · " + account;
            return kind.Replace('_', ' ') + (String.IsNullOrWhiteSpace(account) ? "" : " · " + account);
        }

        private static string Cell(string value)
        {
            return (value ?? "").Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
        }

        private void SetTrailingIndicator(int mode, string tooltip)
        {
            Dispatcher.BeginInvoke(new Action(delegate
            {
                if (mode == 1)
                {
                    trailingCheck.Text = "✓ ON";
                    trailingButton.Background = ColorBrush(36, 151, 91);
                    trailingButton.BorderBrush = ColorBrush(92, 224, 151);
                    trailingIndicator.Background = ColorBrush(36, 151, 91);
                    trailingIndicator.BorderBrush = ColorBrush(92, 224, 151);
                    trailingCheck.Foreground = Brushes.White;
                }
                else if (mode == 2)
                {
                    trailingCheck.Text = "...";
                    trailingButton.Background = ColorBrush(180, 112, 28);
                    trailingButton.BorderBrush = ColorBrush(244, 183, 83);
                    trailingIndicator.Background = ColorBrush(180, 112, 28);
                    trailingIndicator.BorderBrush = ColorBrush(244, 183, 83);
                    trailingCheck.Foreground = Brushes.White;
                }
                else
                {
                    trailingCheck.Text = "OFF";
                    trailingButton.Background = ColorBrush(52, 54, 60);
                    trailingButton.BorderBrush = ColorBrush(82, 85, 94);
                    trailingIndicator.Background = ColorBrush(37, 38, 43);
                    trailingIndicator.BorderBrush = ColorBrush(76, 78, 85);
                    trailingCheck.Foreground = ColorBrush(103, 105, 112);
                }
                trailingIndicator.ToolTip = tooltip;
            }));
        }

        private void SetStatus(string text, Brush brush)
        {
            Dispatcher.BeginInvoke(new Action(delegate { status.Text = text; status.Foreground = brush; }));
        }
    }
}





