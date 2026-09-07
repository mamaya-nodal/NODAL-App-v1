// NODAL Ninja Connector v0.4
// Read-only local connector for NinjaTrader 8. It never sends trading orders.

#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using NinjaTrader.Cbi;
using NinjaTrader.Code;
using NinjaTrader.NinjaScript;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
	public class NodalNinjaConnector : AddOnBase
	{
		private const string ConnectorVersion = "0.4";
		private const string ConfigFileName = "nodal-ninja-connector.config";
		private const string TelemetryQueueFileName = "nodal-ninja-telemetry.queue";
		private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
		private readonly HashSet<Account> subscribedAccounts = new HashSet<Account>();
		private readonly SemaphoreSlim authorizationLock = new SemaphoreSlim(1, 1);
		private readonly SemaphoreSlim telemetryFlushLock = new SemaphoreSlim(1, 1);
		private readonly Dictionary<string, DateTime> lastBalanceSampleUtc = new Dictionary<string, DateTime>(StringComparer.Ordinal);
		private readonly object telemetryFileLock = new object();
		private readonly object sendLock = new object();
		private string lastSentFingerprint = string.Empty;
		private bool sendInProgress;
		private bool sendQueued;
		private bool forceSendQueued;
		private ConnectorSettings settings;
		private Timer heartbeatTimer;
		private int heartbeatInProgress;
		private int retryScheduled;
		private bool heartbeatWasHealthy;
		private bool terminated;
		private string telemetryQueuePath;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Name = "NODAL Ninja Connector";
				Description = "Envía inventario y saldos a NODAL en modo de solo lectura.";
			}
			else if (State == State.Active)
			{
				terminated = false;
				settings = ConnectorSettings.Load();
				telemetryQueuePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NinjaTrader 8", "NODAL", TelemetryQueueFileName);
				if (!settings.HasBaseUrl)
				{
					Write("CONFIGURACION_PENDIENTE|Ejecutá la configuración de NODAL con el código temporal mostrado en la app.");
					return;
				}

				Account.AccountStatusUpdate += OnAccountStatusUpdate;
				RefreshInventory();
				heartbeatTimer = new Timer(_ => QueueHeartbeat(), null, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(15));
				Write("INICIO|modo=solo_lectura|identidad=usuario_nodal|version=" + ConnectorVersion);
			}
			else if (State == State.Terminated)
			{
				terminated = true;
				heartbeatTimer?.Dispose();
				heartbeatTimer = null;
				Account.AccountStatusUpdate -= OnAccountStatusUpdate;
				foreach (Account account in subscribedAccounts.ToList())
				{
					account.AccountItemUpdate -= OnAccountItemUpdate;
					account.ExecutionUpdate -= OnExecutionUpdate;
					account.PositionUpdate -= OnPositionUpdate;
				}
				subscribedAccounts.Clear();
				Write("FIN|NODAL Ninja Connector detenido");
			}
		}

		private void OnAccountStatusUpdate(object sender, AccountStatusEventArgs e)
		{
			RefreshInventory();
		}

		private void OnAccountItemUpdate(object sender, AccountItemEventArgs e)
		{
			if (e.Account == null || e.Account.Connection == null || !IsObserved(e.AccountItem))
				return;

			QueueInventorySend(false);
			QueueBalanceSample(e.Account, false);
		}

		private void OnExecutionUpdate(object sender, ExecutionEventArgs e)
		{
			Account account = sender as Account;
			Execution execution = e.Execution;
			if (account == null || execution == null || execution.Instrument == null)
				return;

			string orderAction = execution.Order == null ? "Unknown" : execution.Order.OrderAction.ToString();
			string json = "{"
				+ "\"kind\":\"execution\","
				+ CommonTelemetryJson(account, execution.Time)
				+ "\"instrument\":\"" + Escape(execution.Instrument.FullName) + "\","
				+ "\"executionId\":\"" + Escape(string.IsNullOrWhiteSpace(execution.ExecutionId) ? Guid.NewGuid().ToString("N") : execution.ExecutionId) + "\","
				+ "\"orderId\":\"" + Escape(string.IsNullOrWhiteSpace(execution.OrderId) ? "Unknown" : execution.OrderId) + "\","
				+ "\"orderAction\":\"" + Escape(orderAction) + "\","
				+ "\"marketPosition\":\"" + Escape(execution.MarketPosition.ToString()) + "\","
				+ "\"price\":" + Number(execution.Price) + ","
				+ "\"quantity\":" + execution.Quantity.ToString(CultureInfo.InvariantCulture)
				+ "}";
			QueueTelemetry(json);
		}

		private void OnPositionUpdate(object sender, PositionEventArgs e)
		{
			Account account = sender as Account;
			if (account == null || e.Position == null || e.Position.Instrument == null)
				return;

			string json = "{"
				+ "\"kind\":\"position\","
				+ CommonTelemetryJson(account, DateTime.UtcNow)
				+ "\"instrument\":\"" + Escape(e.Position.Instrument.FullName) + "\","
				+ "\"marketPosition\":\"" + Escape(e.MarketPosition.ToString()) + "\","
				+ "\"averagePrice\":" + Number(e.AveragePrice) + ","
				+ "\"quantity\":" + e.Quantity.ToString(CultureInfo.InvariantCulture)
				+ "}";
			QueueTelemetry(json);
			QueueBalanceSample(account, true);
		}

		private void RefreshInventory(bool force = true)
		{
			if (settings == null || !settings.HasBaseUrl)
				return;

			List<Account> accounts;
			lock (Account.All)
				accounts = Account.All.Where(IsConnected).ToList();

			foreach (Account account in accounts)
			{
				if (subscribedAccounts.Contains(account))
					continue;

				account.AccountItemUpdate += OnAccountItemUpdate;
				account.ExecutionUpdate += OnExecutionUpdate;
				account.PositionUpdate += OnPositionUpdate;
				subscribedAccounts.Add(account);
				QueueBalanceSample(account, true);
				QueueCurrentPositions(account);
			}

			foreach (Account account in subscribedAccounts.Where(account => !accounts.Contains(account)).ToList())
			{
				account.AccountItemUpdate -= OnAccountItemUpdate;
				account.ExecutionUpdate -= OnExecutionUpdate;
				account.PositionUpdate -= OnPositionUpdate;
				subscribedAccounts.Remove(account);
			}

			QueueInventorySend(force);
			QueueTelemetryFlush();
		}

		private string CommonTelemetryJson(Account account, DateTime occurredAt)
		{
			return "\"eventId\":\"" + Guid.NewGuid().ToString("N") + "\","
				+ "\"occurredAt\":\"" + occurredAt.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture) + "\","
				+ "\"accountName\":\"" + Escape(account.Name) + "\","
				+ "\"connectionName\":\"" + Escape(ConnectionName(account)) + "\","
				+ "\"providerName\":\"" + Escape(ProviderName(account)) + "\",";
		}

		private void QueueCurrentPositions(Account account)
		{
			List<Position> positions;
			lock (account.Positions)
				positions = account.Positions.ToList();

			foreach (Position position in positions)
			{
				if (position == null || position.Instrument == null) continue;
				string json = "{"
					+ "\"kind\":\"position\","
					+ CommonTelemetryJson(account, DateTime.UtcNow)
					+ "\"instrument\":\"" + Escape(position.Instrument.FullName) + "\","
					+ "\"marketPosition\":\"" + Escape(position.MarketPosition.ToString()) + "\","
					+ "\"averagePrice\":" + Number(position.AveragePrice) + ","
					+ "\"quantity\":" + position.Quantity.ToString(CultureInfo.InvariantCulture)
					+ "}";
				QueueTelemetry(json);
			}
		}

		private void QueueBalanceSample(Account account, bool force)
		{
			if (account == null) return;
			string key = ConnectionName(account) + "|" + account.Name;
			lock (telemetryFileLock)
			{
				DateTime last;
				if (!force && lastBalanceSampleUtc.TryGetValue(key, out last) && DateTime.UtcNow - last < TimeSpan.FromSeconds(1))
					return;
				lastBalanceSampleUtc[key] = DateTime.UtcNow;
			}

			string json = "{"
				+ "\"kind\":\"balance\","
				+ CommonTelemetryJson(account, DateTime.UtcNow)
				+ "\"cashValue\":" + Number(Read(account, AccountItem.CashValue)) + ","
				+ "\"netLiquidation\":" + Number(Read(account, AccountItem.NetLiquidation)) + ","
				+ "\"totalCashBalance\":" + Number(Read(account, AccountItem.TotalCashBalance)) + ","
				+ "\"realizedProfitLoss\":" + Number(Read(account, AccountItem.RealizedProfitLoss)) + ","
				+ "\"unrealizedProfitLoss\":" + Number(Read(account, AccountItem.UnrealizedProfitLoss))
				+ "}";
			QueueTelemetry(json);
		}

		private void QueueTelemetry(string eventJson)
		{
			try
			{
				lock (telemetryFileLock)
				{
					Directory.CreateDirectory(Path.GetDirectoryName(telemetryQueuePath));
					File.AppendAllText(telemetryQueuePath, ConnectorSettings.ProtectTelemetry(eventJson) + Environment.NewLine, Encoding.UTF8);
					FileInfo queue = new FileInfo(telemetryQueuePath);
					if (queue.Length > 8 * 1024 * 1024)
					{
						string[] lines = File.ReadAllLines(telemetryQueuePath);
						File.WriteAllLines(telemetryQueuePath, lines.Skip(Math.Max(0, lines.Length - 5000)), Encoding.UTF8);
					}
				}
				QueueTelemetryFlush();
			}
			catch (Exception exception) { Write("TELEMETRIA_COLA_ERROR|" + exception.GetType().Name); }
		}

		private void QueueTelemetryFlush()
		{
			if (terminated) return;
			Task.Run(FlushTelemetryAsync);
		}

		private async Task FlushTelemetryAsync()
		{
			if (!await telemetryFlushLock.WaitAsync(0)) return;
			try
			{
				List<string> protectedLines;
				List<string> events;
				lock (telemetryFileLock)
				{
					protectedLines = File.Exists(telemetryQueuePath)
						? File.ReadAllLines(telemetryQueuePath).Where(line => !string.IsNullOrWhiteSpace(line)).Take(50).ToList()
						: new List<string>();
					events = protectedLines.Select(ConnectorSettings.UnprotectTelemetry).Where(value => !string.IsNullOrWhiteSpace(value)).ToList();
				}
				if (events.Count == 0) return;

				string payload = "{\"kind\":\"trade_telemetry_batch\",\"batchId\":\""
					+ Guid.NewGuid().ToString("N") + "\",\"observedAt\":\""
					+ DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + "\",\"events\":["
					+ string.Join(",", events) + "]}";
				using (HttpResponseMessage response = await SendAuthorizedAsync("/api/integrations/ninjatrader/telemetry", payload))
				{
					if (response == null || !response.IsSuccessStatusCode) return;
				}

				lock (telemetryFileLock)
				{
					List<string> remaining = File.Exists(telemetryQueuePath) ? File.ReadAllLines(telemetryQueuePath).ToList() : new List<string>();
					foreach (string sent in protectedLines)
					{
						int index = remaining.IndexOf(sent);
						if (index >= 0) remaining.RemoveAt(index);
					}
					File.WriteAllLines(telemetryQueuePath, remaining, Encoding.UTF8);
				}
				Write("TELEMETRIA_OK|eventos=" + events.Count.ToString(CultureInfo.InvariantCulture));
				QueueTelemetryFlush();
			}
			catch (Exception exception) { Write("TELEMETRIA_ERROR|" + exception.GetType().Name); }
			finally { telemetryFlushLock.Release(); }
		}

		private void QueueInventorySend(bool force)
		{
			lock (sendLock)
			{
				forceSendQueued = forceSendQueued || force;
				if (sendQueued)
					return;
				sendQueued = true;
			}

			Task.Run(async () =>
			{
				await Task.Delay(750);
				bool forceCurrent;
				lock (sendLock)
				{
					sendQueued = false;
					forceCurrent = forceSendQueued;
					forceSendQueued = false;
				}
				await SendInventoryAsync(forceCurrent);
			});
		}

		private void QueueHeartbeat()
		{
			if (terminated || Interlocked.Exchange(ref heartbeatInProgress, 1) == 1)
				return;

			// AccountStatusUpdate is not guaranteed for every provider. Re-scan on each
			// heartbeat so newly connected or removed accounts are detected without a
			// NinjaScript recompile. The fingerprint prevents duplicate inventory sends.
			RefreshInventory(false);

			Task.Run(async () =>
			{
				try { await SendHeartbeatAsync(); }
				finally { Interlocked.Exchange(ref heartbeatInProgress, 0); }
			});
		}

		private void QueueRetry()
		{
			if (terminated || Interlocked.Exchange(ref retryScheduled, 1) == 1)
				return;

			Task.Run(async () =>
			{
				await Task.Delay(TimeSpan.FromSeconds(15));
				Interlocked.Exchange(ref retryScheduled, 0);
				if (!terminated)
					QueueInventorySend(true);
			});
		}

		private async Task SendHeartbeatAsync()
		{
			try
			{
				using (HttpResponseMessage response = await SendAuthorizedAsync("/api/integrations/ninjatrader/heartbeat", "{}"))
				{
					bool healthy = response != null && response.IsSuccessStatusCode;
					if (healthy && !heartbeatWasHealthy)
						Write("CONEXION_OK|El conector seguirá informando aunque cierres sesión en la web.");
					if (!healthy && heartbeatWasHealthy)
						Write("CONEXION_INTERRUMPIDA|NODAL no confirmó la señal del conector.");
					heartbeatWasHealthy = healthy;
				}
			}
			catch (Exception exception)
			{
				if (heartbeatWasHealthy) Write("CONEXION_ERROR|" + exception.GetType().Name);
				heartbeatWasHealthy = false;
			}
		}

		private async Task SendInventoryAsync(bool force)
		{
			List<Account> accounts;
			lock (Account.All)
				accounts = Account.All.Where(IsConnected).ToList();

			string fingerprint = BuildInventoryFingerprint(accounts);
			lock (sendLock)
			{
				if (sendInProgress || (!force && string.Equals(lastSentFingerprint, fingerprint, StringComparison.Ordinal)))
					return;
				sendInProgress = true;
			}

			try
			{
				string payload = BuildInventoryPayload(accounts);
				using (HttpResponseMessage response = await SendAuthorizedAsync("/api/integrations/ninjatrader/ingest", payload))
				{
					if (response != null && response.IsSuccessStatusCode)
					{
						lock (sendLock) lastSentFingerprint = fingerprint;
						Write("ENVIO_OK|cuentas=" + accounts.Count.ToString(CultureInfo.InvariantCulture));
					}
					else
					{
						Write("ENVIO_RECHAZADO|El inventario no fue aceptado.");
						QueueRetry();
					}
				}
			}
			catch (Exception exception)
			{
				Write("ENVIO_ERROR|" + exception.GetType().Name);
				QueueRetry();
			}
			finally
			{
				lock (sendLock) sendInProgress = false;
			}
		}

		private async Task<HttpResponseMessage> SendAuthorizedAsync(string path, string payload)
		{
			if (!await EnsureAuthorizationAsync()) return null;
			HttpResponseMessage response = await PostAsync(path, payload, settings.AccessToken);
			if (response.StatusCode != HttpStatusCode.Unauthorized) return response;

			response.Dispose();
			settings.ClearAccess();
			if (!await EnsureAuthorizationAsync()) return null;
			return await PostAsync(path, payload, settings.AccessToken);
		}

		private async Task<bool> EnsureAuthorizationAsync()
		{
			if (settings.HasFreshAccess) return true;
			await authorizationLock.WaitAsync();
			try
			{
				if (settings.HasFreshAccess) return true;
				if (settings.HasRefresh)
				{
					using (HttpResponseMessage response = await PostAsync("/api/integrations/ninjatrader/refresh", "{}", settings.RefreshToken))
					{
						if (response.IsSuccessStatusCode && await ApplySessionAsync(response)) return true;
					}
					settings.ClearAuthorization();
				}

				if (!settings.HasPairingCode)
				{
					Write("VINCULACION_REQUERIDA|Generá un nuevo código desde NODAL App.");
					return false;
				}

				string payload = "{\"code\":\"" + Escape(settings.PairingCode) + "\",\"connectorVersion\":\"" + ConnectorVersion + "\"}";
				using (HttpResponseMessage response = await PostAsync("/api/integrations/ninjatrader/pair", payload, null))
				{
					if (!response.IsSuccessStatusCode || !await ApplySessionAsync(response))
					{
						Write("VINCULACION_RECHAZADA|El código venció o ya fue utilizado.");
						return false;
					}
				}

				Write("VINCULACION_OK|El conector quedó asociado al usuario NODAL.");
				return true;
			}
			catch (Exception exception)
			{
				Write("AUTORIZACION_ERROR|" + exception.GetType().Name);
				return false;
			}
			finally
			{
				authorizationLock.Release();
			}
		}

		private async Task<bool> ApplySessionAsync(HttpResponseMessage response)
		{
			string json = await response.Content.ReadAsStringAsync();
			string connectorId = JsonString(json, "connectorId");
			string accessToken = JsonString(json, "accessToken");
			string accessExpiresAt = JsonString(json, "accessExpiresAt");
			string refreshToken = JsonString(json, "refreshToken");
			string refreshExpiresAt = JsonString(json, "refreshExpiresAt");
			DateTime accessExpiration;
			DateTime refreshExpiration;
			if (string.IsNullOrWhiteSpace(connectorId) || string.IsNullOrWhiteSpace(accessToken)
				|| string.IsNullOrWhiteSpace(refreshToken)
				|| !DateTime.TryParse(accessExpiresAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out accessExpiration)
				|| !DateTime.TryParse(refreshExpiresAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out refreshExpiration))
				return false;

			settings.ApplySession(connectorId, accessToken, accessExpiration.ToUniversalTime(), refreshToken, refreshExpiration.ToUniversalTime());
			return true;
		}

		private async Task<HttpResponseMessage> PostAsync(string path, string payload, string bearer)
		{
			using (HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, settings.BaseUrl.TrimEnd('/') + path))
			{
				if (!string.IsNullOrWhiteSpace(bearer)) request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", bearer);
				request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
				return await Http.SendAsync(request);
			}
		}

		private static string JsonString(string json, string property)
		{
			Match match = Regex.Match(json ?? string.Empty, "\\\"" + Regex.Escape(property) + "\\\"\\s*:\\s*\\\"(?<value>[^\\\"]*)\\\"");
			return match.Success ? match.Groups["value"].Value : string.Empty;
		}

		private static string BuildInventoryFingerprint(IEnumerable<Account> accounts)
		{
			return string.Join("|", accounts
				.OrderBy(account => ConnectionName(account), StringComparer.Ordinal)
				.ThenBy(account => account.Name, StringComparer.Ordinal)
				.Select(account => string.Join(",",
					ConnectionName(account), ConnectionStatus(account), account.Name,
					Number(Read(account, AccountItem.CashValue)),
					Number(Read(account, AccountItem.NetLiquidation)),
					Number(Read(account, AccountItem.TotalCashBalance)),
					Number(Read(account, AccountItem.RealizedProfitLoss)),
					Number(Read(account, AccountItem.UnrealizedProfitLoss)))));
		}

		private static string BuildInventoryPayload(IEnumerable<Account> accounts)
		{
			return "{"
				+ "\"kind\":\"inventory_snapshot\","
				+ "\"eventId\":\"" + Escape(Guid.NewGuid().ToString("N")) + "\","
				+ "\"observedAt\":\"" + DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + "\","
				+ "\"accounts\":[" + string.Join(",", accounts.Select(BuildAccountJson)) + "]"
				+ "}";
		}

		private static string BuildAccountJson(Account account)
		{
			return "{"
				+ "\"accountName\":\"" + Escape(account.Name) + "\","
				+ "\"connectionName\":\"" + Escape(ConnectionName(account)) + "\","
				+ "\"connectionStatus\":\"" + Escape(ConnectionStatus(account)) + "\","
				+ "\"providerName\":\"" + Escape(ProviderName(account)) + "\","
				+ "\"cashValue\":" + Number(Read(account, AccountItem.CashValue)) + ","
				+ "\"netLiquidation\":" + Number(Read(account, AccountItem.NetLiquidation)) + ","
				+ "\"totalCashBalance\":" + Number(Read(account, AccountItem.TotalCashBalance)) + ","
				+ "\"realizedProfitLoss\":" + Number(Read(account, AccountItem.RealizedProfitLoss)) + ","
				+ "\"unrealizedProfitLoss\":" + Number(Read(account, AccountItem.UnrealizedProfitLoss))
				+ "}";
		}

		private static bool IsConnected(Account account)
		{
			return account != null && account.Connection != null
				&& string.Equals(ConnectionStatus(account), "Connected", StringComparison.OrdinalIgnoreCase);
		}

		private static bool IsObserved(AccountItem accountItem)
		{
			return accountItem == AccountItem.CashValue
				|| accountItem == AccountItem.NetLiquidation
				|| accountItem == AccountItem.TotalCashBalance
				|| accountItem == AccountItem.RealizedProfitLoss
				|| accountItem == AccountItem.UnrealizedProfitLoss;
		}

		private static double Read(Account account, AccountItem accountItem)
		{
			try { return account.Get(accountItem, Currency.UsDollar); }
			catch { return double.NaN; }
		}

		private static string Number(double value)
		{
			return double.IsNaN(value) || double.IsInfinity(value)
				? "null"
				: value.ToString("0.00", CultureInfo.InvariantCulture);
		}

		private static string ConnectionName(Account account)
		{
			return account.Connection == null || account.Connection.Options == null ? "sin_conexion" : account.Connection.Options.Name;
		}

		private static string ProviderName(Account account)
		{
			return account.Connection == null || account.Connection.Options == null ? "sin_proveedor" : account.Connection.Options.Provider.ToString();
		}

		private static string ConnectionStatus(Account account)
		{
			return account.Connection == null ? "sin_conexion" : account.Connection.Status.ToString();
		}

		private static string Escape(string value)
		{
			return (value ?? string.Empty).Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
		}

		private static void Write(string message)
		{
			Output.Process("[NODAL CONNECTOR] " + message, PrintTo.OutputTab1);
		}

		private sealed class ConnectorSettings
		{
			private const int CryptProtectUiForbidden = 0x1;
			private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("NODAL-Ninja-Connector-v0.2");
			private readonly string path;
			public string BaseUrl { get; private set; }
			public string PairingCode { get; private set; }
			public string ConnectorId { get; private set; }
			public string AccessToken { get; private set; }
			public DateTime AccessExpiresAtUtc { get; private set; }
			public string RefreshToken { get; private set; }
			public DateTime RefreshExpiresAtUtc { get; private set; }

			private ConnectorSettings(string configPath) { path = configPath; }
			public bool HasBaseUrl { get { return !string.IsNullOrWhiteSpace(BaseUrl); } }
			public bool HasPairingCode { get { return !string.IsNullOrWhiteSpace(PairingCode); } }
			public bool HasFreshAccess { get { return !string.IsNullOrWhiteSpace(AccessToken) && AccessExpiresAtUtc > DateTime.UtcNow.AddMinutes(1); } }
			public bool HasRefresh { get { return !string.IsNullOrWhiteSpace(RefreshToken) && RefreshExpiresAtUtc > DateTime.UtcNow.AddMinutes(1); } }

			public static ConnectorSettings Load()
			{
				string configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NinjaTrader 8", "NODAL", ConfigFileName);
				ConnectorSettings result = new ConnectorSettings(configPath);
				if (!File.Exists(configPath)) return result;
				Dictionary<string, string> values = File.ReadAllLines(configPath)
					.Select(line => new { Line = line, Separator = line.IndexOf('=') })
					.Where(item => item.Separator > 0)
					.ToDictionary(item => item.Line.Substring(0, item.Separator).Trim(), item => item.Line.Substring(item.Separator + 1).Trim(), StringComparer.OrdinalIgnoreCase);

				string value;
				if (values.TryGetValue("BaseUrl", out value)) result.BaseUrl = value;
				if (values.TryGetValue("PairingCode", out value)) result.PairingCode = value;
				if (values.TryGetValue("ConnectorId", out value)) result.ConnectorId = value;
				if (values.TryGetValue("AccessTokenProtected", out value)) result.AccessToken = Unprotect(value);
				if (values.TryGetValue("RefreshTokenProtected", out value)) result.RefreshToken = Unprotect(value);
				DateTime parsed;
				if (values.TryGetValue("AccessExpiresAtUtc", out value) && DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed)) result.AccessExpiresAtUtc = parsed.ToUniversalTime();
				if (values.TryGetValue("RefreshExpiresAtUtc", out value) && DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed)) result.RefreshExpiresAtUtc = parsed.ToUniversalTime();
				return result;
			}

			public void ApplySession(string connectorId, string accessToken, DateTime accessExpiresAtUtc, string refreshToken, DateTime refreshExpiresAtUtc)
			{
				ConnectorId = connectorId;
				AccessToken = accessToken;
				AccessExpiresAtUtc = accessExpiresAtUtc;
				RefreshToken = refreshToken;
				RefreshExpiresAtUtc = refreshExpiresAtUtc;
				PairingCode = string.Empty;
				Save();
			}

			public void ClearAccess()
			{
				AccessToken = string.Empty;
				AccessExpiresAtUtc = DateTime.MinValue;
				Save();
			}

			public void ClearAuthorization()
			{
				AccessToken = string.Empty;
				AccessExpiresAtUtc = DateTime.MinValue;
				RefreshToken = string.Empty;
				RefreshExpiresAtUtc = DateTime.MinValue;
				ConnectorId = string.Empty;
				Save();
			}

			private void Save()
			{
				Directory.CreateDirectory(Path.GetDirectoryName(path));
				File.WriteAllLines(path, new[] {
					"BaseUrl=" + (BaseUrl ?? string.Empty),
					"PairingCode=" + (PairingCode ?? string.Empty),
					"ConnectorId=" + (ConnectorId ?? string.Empty),
					"AccessTokenProtected=" + Protect(AccessToken),
					"AccessExpiresAtUtc=" + AccessExpiresAtUtc.ToString("O", CultureInfo.InvariantCulture),
					"RefreshTokenProtected=" + Protect(RefreshToken),
					"RefreshExpiresAtUtc=" + RefreshExpiresAtUtc.ToString("O", CultureInfo.InvariantCulture)
				});
			}

			private static string Protect(string value)
			{
				if (string.IsNullOrEmpty(value)) return string.Empty;
				DataBlob input = CreateBlob(Encoding.UTF8.GetBytes(value));
				DataBlob entropy = CreateBlob(Entropy);
				DataBlob output = new DataBlob();
				try
				{
					if (!CryptProtectData(ref input, "NODAL Ninja Connector", ref entropy, IntPtr.Zero, IntPtr.Zero, CryptProtectUiForbidden, out output))
						throw new InvalidOperationException("No se pudo proteger la credencial local.");
					return Convert.ToBase64String(ReadBlob(output));
				}
				finally
				{
					ReleaseInputBlob(ref input);
					ReleaseInputBlob(ref entropy);
					ReleaseOutputBlob(ref output);
				}
			}

			private static string Unprotect(string value)
			{
				if (string.IsNullOrWhiteSpace(value)) return string.Empty;
				DataBlob input = new DataBlob();
				DataBlob entropy = new DataBlob();
				DataBlob output = new DataBlob();
				try
				{
					input = CreateBlob(Convert.FromBase64String(value));
					entropy = CreateBlob(Entropy);
					if (!CryptUnprotectData(ref input, IntPtr.Zero, ref entropy, IntPtr.Zero, IntPtr.Zero, CryptProtectUiForbidden, out output))
						return string.Empty;
					return Encoding.UTF8.GetString(ReadBlob(output));
				}
				catch { return string.Empty; }
				finally
				{
					ReleaseInputBlob(ref input);
					ReleaseInputBlob(ref entropy);
					ReleaseOutputBlob(ref output);
				}
			}

			public static string ProtectTelemetry(string value) { return Protect(value); }
			public static string UnprotectTelemetry(string value) { return Unprotect(value); }

			private static DataBlob CreateBlob(byte[] bytes)
			{
				DataBlob blob = new DataBlob { Size = bytes.Length, Data = Marshal.AllocHGlobal(bytes.Length) };
				Marshal.Copy(bytes, 0, blob.Data, bytes.Length);
				return blob;
			}

			private static byte[] ReadBlob(DataBlob blob)
			{
				byte[] bytes = new byte[blob.Size];
				if (blob.Size > 0) Marshal.Copy(blob.Data, bytes, 0, blob.Size);
				return bytes;
			}

			private static void ReleaseInputBlob(ref DataBlob blob)
			{
				if (blob.Data != IntPtr.Zero) Marshal.FreeHGlobal(blob.Data);
				blob.Data = IntPtr.Zero;
				blob.Size = 0;
			}

			private static void ReleaseOutputBlob(ref DataBlob blob)
			{
				if (blob.Data != IntPtr.Zero) LocalFree(blob.Data);
				blob.Data = IntPtr.Zero;
				blob.Size = 0;
			}

			[StructLayout(LayoutKind.Sequential)]
			private struct DataBlob
			{
				public int Size;
				public IntPtr Data;
			}

			[DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
			private static extern bool CryptProtectData(ref DataBlob dataIn, string description, ref DataBlob optionalEntropy, IntPtr reserved, IntPtr promptStruct, int flags, out DataBlob dataOut);

			[DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
			private static extern bool CryptUnprotectData(ref DataBlob dataIn, IntPtr description, ref DataBlob optionalEntropy, IntPtr reserved, IntPtr promptStruct, int flags, out DataBlob dataOut);

			[DllImport("kernel32.dll", SetLastError = true)]
			private static extern IntPtr LocalFree(IntPtr memory);
		}
	}
}
