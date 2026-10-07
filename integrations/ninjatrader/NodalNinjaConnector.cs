// NODAL Ninja Connector v0.14 (server v2 required)
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
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Code;
using NinjaTrader.NinjaScript;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
	// Pure transport/storage helper, also exercised outside NinjaTrader by the test harness.
	internal sealed class NodalReliableTelemetry
	{
		internal sealed class Entry
		{
			public string Path;
			public string Payload;
			public string Hash;
			public string Id;
		}
		private readonly string legacyPath;
		private readonly string directory;
		private readonly Func<string, string> protect;
		private readonly Func<string, string> unprotect;
		private bool secured;
		private long lastWrittenTicks;
		public NodalReliableTelemetry(string path, Func<string, string> encrypt, Func<string, string> decrypt)
		{
			legacyPath = path; directory = path + ".v2"; protect = encrypt; unprotect = decrypt;
		}
		private static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = 1024 * 1024, RecursionLimit = 32 }; }
		internal static string Hash(string value)
		{
			using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-", "").ToLowerInvariant();
		}
		internal static bool IsAllowedOrigin(string value)
		{
			Uri uri;
			return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == "https" && uri.Port == 443
				&& string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment)
				&& uri.AbsolutePath == "/" && (uri.Host == "app.nodaltrading.com" || uri.Host == "nodal-app-preview.vercel.app");
		}
		private IDisposable Lock()
		{
			Directory.CreateDirectory(directory);
			if (!secured) {
				DirectorySecurity acl = new DirectorySecurity();
				acl.SetAccessRuleProtection(true, false);
				InheritanceFlags inherit = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
				acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
				acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
				Directory.SetAccessControl(directory, acl);
				secured = true;
			}
			for (int i = 0; ; i++) {
				try { return new FileStream(System.IO.Path.Combine(directory, ".lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
				catch (IOException) { if (i >= 50) throw; Thread.Sleep(20); }
			}
		}
		private void WriteNew(string path, string value)
		{
			if (File.Exists(path)) return;
			string tmp = path + ".tmp." + Guid.NewGuid().ToString("N");
			byte[] bytes = Encoding.UTF8.GetBytes(value);
			// Interrupted temporary writes are never treated as committed events.
			using (FileStream stream = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
				stream.Write(bytes, 0, bytes.Length); stream.Flush(true);
			}
			File.Move(tmp, path);
			// Keep source order even when the system clock has a coarse resolution.
			lastWrittenTicks = Math.Max(DateTime.UtcNow.Ticks, lastWrittenTicks + 10);
			File.SetLastWriteTimeUtc(path, new DateTime(lastWrittenTicks, DateTimeKind.Utc));
		}
		private static string EventId(string payload)
		{
			if (string.IsNullOrWhiteSpace(payload) || Encoding.UTF8.GetByteCount(payload) > 8192) throw new InvalidDataException("Invalid event");
			Dictionary<string, object> data = Json().DeserializeObject(payload) as Dictionary<string, object>;
			object id;
			if (data == null || !data.TryGetValue("eventId", out id) || !(id is string)
				|| ((string)id).Length == 0 || ((string)id).Length > 160) throw new InvalidDataException("Invalid event ID");
			foreach (string key in new[] { "occurredAt", "accountName", "connectionName", "providerName", "kind" }) RequireText(data, key);
			DateTimeOffset occurred;
			if (!DateTimeOffset.TryParse((string)data["occurredAt"], CultureInfo.InvariantCulture, DateTimeStyles.None, out occurred)) throw new InvalidDataException("Invalid date");
			string kind = (string)data["kind"];
			if (kind == "balance") {
				foreach (string key in new[] { "cashValue", "netLiquidation", "totalCashBalance", "realizedProfitLoss", "unrealizedProfitLoss" }) RequireNumber(data, key, true);
			} else if (kind == "position" || kind == "execution") {
				RequireText(data, "instrument"); RequireText(data, "marketPosition");
				double quantity = RequireNumber(data, "quantity", false);
				if (quantity != Math.Truncate(quantity) || quantity < (kind == "execution" ? 1 : 0)) throw new InvalidDataException("Invalid quantity");
				RequireNumber(data, kind == "execution" ? "price" : "averagePrice", false);
				if (kind == "execution") foreach (string key in new[] { "executionId", "orderId", "orderAction" }) RequireText(data, key);
			} else throw new InvalidDataException("Invalid kind");
			return (string)id;
		}
		private static void RequireText(Dictionary<string, object> data, string key)
		{
			object value;
			if (!data.TryGetValue(key, out value) || !(value is string) || ((string)value).Length < 1 || ((string)value).Length > 160) throw new InvalidDataException("Invalid text");
		}
		private static double RequireNumber(Dictionary<string, object> data, string key, bool nullable)
		{
			object value;
			if (!data.TryGetValue(key, out value)) throw new InvalidDataException("Missing number");
			if (nullable && value == null) return 0;
			if (!(value is int || value is long || value is decimal || value is double || value is float)) throw new InvalidDataException("Invalid number");
			double number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
			if (double.IsNaN(number) || double.IsInfinity(number)) throw new InvalidDataException("Invalid number");
			return number;
		}
		private void MigrateLegacy()
		{
			string marker = System.IO.Path.Combine(directory, ".legacy-imported");
			if (File.Exists(marker) || !File.Exists(legacyPath)) return;
			// Source remains intact. A crash retries the same content-addressed imports.
			foreach (string line in File.ReadLines(legacyPath)) {
				if (string.IsNullOrWhiteSpace(line)) continue;
				string payload = null;
				bool valid;
				try { payload = unprotect(line); EventId(payload); valid = true; } catch { valid = false; }
				string path = System.IO.Path.Combine(directory, (valid ? Hash(payload) + ".event" : Hash(line) + ".quarantine"));
				WriteNew(path, line);
			}
			WriteNew(marker, "Legacy import complete; original queue retained.");
		}
		public void Append(string payload)
		{
			bool valid;
			try { EventId(payload); valid = true; } catch { valid = false; }
			using (Lock()) {
				MigrateLegacy();
				WriteNew(System.IO.Path.Combine(directory, Hash(payload) + (valid ? ".event" : ".quarantine")), protect(payload));
			}
		}
		public int QuarantineCount { get { return Directory.Exists(directory) ? Directory.GetFiles(directory, "*.quarantine").Length : 0; } }
		public List<Entry> Peek(int limit)
		{
			using (Lock()) {
				MigrateLegacy();
				List<Entry> entries = new List<Entry>();
				HashSet<string> ids = new HashSet<string>(StringComparer.Ordinal);
				foreach (string path in Directory.GetFiles(directory, "*.event").OrderBy(File.GetLastWriteTimeUtc).ThenBy(p => p, StringComparer.Ordinal)) {
					Entry entry;
					try {
						string payload = unprotect(File.ReadAllText(path, Encoding.UTF8));
						string id = EventId(payload);
						string hash = Hash(payload);
						if (System.IO.Path.GetFileName(path) != hash + ".event") throw new InvalidDataException("Hash mismatch");
						entry = new Entry { Path = path, Payload = payload, Hash = hash, Id = id };
					} catch {
						File.Move(path, path + "." + Guid.NewGuid().ToString("N") + ".quarantine");
						continue;
					}
					// Conflicting IDs are sent on separate attempts, never silently merged.
					if (!ids.Add(entry.Id)) continue;
					entries.Add(entry);
					if (entries.Count >= limit) break;
				}
				return entries;
			}
		}
		public static string BuildBatch(string batchId, List<Entry> entries)
		{
			return Json().Serialize(new { protocol = 2, batchId = batchId,
				events = entries.Select(e => new { payload = e.Payload, sha256 = e.Hash }).ToArray() });
		}
		public int ApplyReceipts(string batchId, List<Entry> entries, string response)
		{
			Dictionary<string, object> root = Json().DeserializeObject(response) as Dictionary<string, object>;
			object protocol; object returnedBatch; object receiptsValue;
			if (root == null || !root.TryGetValue("protocol", out protocol) || !(protocol is int) || (int)protocol != 2
				|| !root.TryGetValue("batchId", out returnedBatch) || !Equals(returnedBatch, batchId)
				|| !root.TryGetValue("receipts", out receiptsValue) || !(receiptsValue is object[])) throw new InvalidDataException("Unconfirmed response");
			object[] receipts = (object[])receiptsValue;
			if (receipts.Length != entries.Count) throw new InvalidDataException("Incomplete receipts");
			Dictionary<string, string> decisions = new Dictionary<string, string>(StringComparer.Ordinal);
			foreach (object item in receipts) {
				Dictionary<string, object> receipt = item as Dictionary<string, object>;
				object id; object hash; object status;
				if (receipt == null || !receipt.TryGetValue("eventId", out id) || !(id is string)
					|| !receipt.TryGetValue("sha256", out hash) || !(hash is string)
					|| !receipt.TryGetValue("status", out status) || !(status is string)) throw new InvalidDataException("Invalid receipt");
				Entry entry = entries.SingleOrDefault(e => e.Id == (string)id && e.Hash == (string)hash);
				if (entry == null || decisions.ContainsKey(entry.Id)
					|| !new[] { "persisted", "excluded", "pending", "conflict" }.Contains((string)status)) throw new InvalidDataException("Unknown receipt");
				decisions.Add(entry.Id, (string)status);
			}
			int acknowledged = 0;
			using (Lock()) foreach (Entry entry in entries) {
				if (!File.Exists(entry.Path)) continue;
				if (Hash(unprotect(File.ReadAllText(entry.Path, Encoding.UTF8))) != entry.Hash) throw new InvalidDataException("Queue changed");
				string status = decisions[entry.Id];
				if (status == "persisted" || status == "excluded") { File.Delete(entry.Path); acknowledged++; }
				else if (status == "conflict") File.Move(entry.Path, entry.Path + "." + Guid.NewGuid().ToString("N") + ".quarantine");
				else File.SetLastWriteTimeUtc(entry.Path, DateTime.UtcNow); // Round-robin: pending never blocks newer events.
			}
			return acknowledged;
		}
	}

	public class NodalNinjaConnector : AddOnBase
	{
		private const string ConnectorVersion = "0.14";
		private const string ConfigFileName = "nodal-ninja-connector.config";
		private const string TelemetryQueueFileName = "nodal-ninja-telemetry.queue";
		private static readonly HttpClient Http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(10), MaxResponseContentBufferSize = 1024 * 1024 };
		private readonly HashSet<Account> subscribedAccounts = new HashSet<Account>();
		private readonly SemaphoreSlim authorizationLock = new SemaphoreSlim(1, 1);
		private readonly SemaphoreSlim telemetryFlushLock = new SemaphoreSlim(1, 1);
		private readonly Dictionary<string, DateTime> lastBalanceSampleUtc = new Dictionary<string, DateTime>(StringComparer.Ordinal);
		private readonly Dictionary<string, string> lastBalanceFingerprint = new Dictionary<string, string>(StringComparer.Ordinal);
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
		private NodalReliableTelemetry telemetry;

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
				telemetry = new NodalReliableTelemetry(telemetryQueuePath, ConnectorSettings.ProtectTelemetry, ConnectorSettings.UnprotectTelemetry);
				if (!settings.HasBaseUrl)
				{
					Write("CONFIGURACION_PENDIENTE|Ejecutá la configuración de NODAL con el código temporal mostrado en la app.");
					return;
				}

				Account.AccountStatusUpdate += OnAccountStatusUpdate;
				RefreshInventory();
				heartbeatTimer = new Timer(_ => QueueHeartbeat(), null, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(15));
				Write("INICIO|modo=solo_lectura|identidad=usuario_nodal|version=" + ConnectorVersion);
				string installedSourceVersion = ConnectorSettings.ReadInstalledSourceVersion();
				if (!string.IsNullOrWhiteSpace(installedSourceVersion)
					&& !string.Equals(installedSourceVersion, ConnectorVersion, StringComparison.OrdinalIgnoreCase))
					Write("ACTUALIZACION_PENDIENTE|codigo=" + installedSourceVersion + "|ejecucion=" + ConnectorVersion + "|Compilá y reiniciá NinjaTrader.");
			}
			else if (State == State.Terminated)
			{
				terminated = true;
				if (heartbeatTimer != null) heartbeatTimer.Dispose();
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

			List<Account> accounts = ConnectedAccounts();

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
			double cashValue = Read(account, AccountItem.CashValue);
			double netLiquidation = Read(account, AccountItem.NetLiquidation);
			double totalCashBalance = Read(account, AccountItem.TotalCashBalance);
			double realizedProfitLoss = Read(account, AccountItem.RealizedProfitLoss);
			double unrealizedProfitLoss = Read(account, AccountItem.UnrealizedProfitLoss);
			string fingerprint = string.Join("|", new[] {
				Number(cashValue),
				Number(netLiquidation),
				Number(totalCashBalance),
				Number(realizedProfitLoss),
				Number(unrealizedProfitLoss)
			});
			string key = ConnectionName(account) + "|" + account.Name;
			lock (telemetryFileLock)
			{
				string previousFingerprint;
				if (!force && lastBalanceFingerprint.TryGetValue(key, out previousFingerprint) && previousFingerprint == fingerprint)
					return;
				DateTime last;
				if (!force && lastBalanceSampleUtc.TryGetValue(key, out last) && DateTime.UtcNow - last < TimeSpan.FromSeconds(1))
					return;
				lastBalanceSampleUtc[key] = DateTime.UtcNow;
				lastBalanceFingerprint[key] = fingerprint;
			}

			string json = "{"
				+ "\"kind\":\"balance\","
				+ CommonTelemetryJson(account, DateTime.UtcNow)
				+ "\"cashValue\":" + Number(cashValue) + ","
				+ "\"netLiquidation\":" + Number(netLiquidation) + ","
				+ "\"totalCashBalance\":" + Number(totalCashBalance) + ","
				+ "\"realizedProfitLoss\":" + Number(realizedProfitLoss) + ","
				+ "\"unrealizedProfitLoss\":" + Number(unrealizedProfitLoss)
				+ "}";
			QueueTelemetry(json);
		}

		private void QueueTelemetry(string eventJson)
		{
			try
			{
				telemetry.Append(eventJson);
				QueueTelemetryFlush();
			}
			catch (Exception exception) {
				lock (telemetryFileLock) { lastBalanceFingerprint.Clear(); lastBalanceSampleUtc.Clear(); }
				Write("TELEMETRIA_CAPTURA_ERROR|No se pudo guardar un evento. Revisar disco y permisos antes de continuar. Los pendientes anteriores se conservan.|" + exception.GetType().Name);
			}
		}

		private void QueueTelemetryFlush()
		{
			if (terminated) return;
			Task.Run((Func<Task>)FlushTelemetryAsync);
		}

		private async Task FlushTelemetryAsync()
		{
			if (!await telemetryFlushLock.WaitAsync(0)) return;
			try
			{
				List<NodalReliableTelemetry.Entry> events = telemetry.Peek(50);
				if (telemetry.QuarantineCount > 0) Write("TELEMETRIA_REVISION|Hay eventos conservados en cuarentena. Contactar soporte; no fueron descartados.");
				if (events.Count == 0) return;
				string batchId = Guid.NewGuid().ToString("N");
				string payload = NodalReliableTelemetry.BuildBatch(batchId, events);
				// JSON escaping can enlarge an envelope. Split, never discard oversized batches.
				while (Encoding.UTF8.GetByteCount(payload) > 480 * 1024 && events.Count > 1) {
					events.RemoveAt(events.Count - 1);
					payload = NodalReliableTelemetry.BuildBatch(batchId, events);
				}
				int acknowledged = 0;
				using (HttpResponseMessage response = await SendAuthorizedAsync("/api/integrations/ninjatrader/telemetry/v2", payload))
				{
					if (response == null || !response.IsSuccessStatusCode) return;
					acknowledged = telemetry.ApplyReceipts(batchId, events, await response.Content.ReadAsStringAsync());
				}
				Write("TELEMETRIA_CONFIRMADA|eventos=" + acknowledged.ToString(CultureInfo.InvariantCulture));
				if (telemetry.QuarantineCount > 0) Write("TELEMETRIA_REVISION|Hay eventos conservados en cuarentena. Contactar soporte; no fueron descartados.");
				// Heartbeat retries pending events; avoid a tight loop on unresolved routes.
				if (acknowledged > 0) Task.Run(async () => { await Task.Delay(1000); QueueTelemetryFlush(); });
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
				string installedSourceVersion = ConnectorSettings.ReadInstalledSourceVersion();
				using (HttpResponseMessage response = await SendAuthorizedAsync(
					"/api/integrations/ninjatrader/heartbeat",
					"{\"connectorVersion\":\"" + ConnectorVersion
					+ "\",\"installedSourceVersion\":\"" + Escape(installedSourceVersion) + "\"}"))
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
			List<Account> accounts = ConnectedAccounts();

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
			if (settings.HasFreshAccess && !settings.HasPairingCode) return true;
			await authorizationLock.WaitAsync();
			try
			{
				if (settings.HasFreshAccess)
					return settings.HasPairingCode ? await LinkAdditionalDestinationAsync() : true;
				if (settings.HasRefresh)
				{
					using (HttpResponseMessage response = await PostAsync("/api/integrations/ninjatrader/refresh", "{}", settings.RefreshToken))
					{
						if (response.IsSuccessStatusCode && await ApplySessionAsync(response, false))
							return settings.HasPairingCode ? await LinkAdditionalDestinationAsync() : true;
						if (response.StatusCode == HttpStatusCode.Unauthorized && settings.HasPairingCode)
						{
							settings.ClearSession();
							Write("SESION_ANTERIOR_DESCARTADA|La credencial anterior fue revocada. Se continuará con el código nuevo.");
						}
						else
						{
						Write(response.StatusCode == HttpStatusCode.Unauthorized
							? "AUTORIZACION_RECHAZADA|La sesión venció o fue revocada. Los registros y la configuración se conservan."
							: "RENOVACION_PENDIENTE|NODAL no confirmó la renovación. Se reintentará conservando la vinculación. HTTP=" + (int)response.StatusCode);
						return false;
						}
					}
				}

				if (!settings.HasPairingCode)
				{
					Write("VINCULACION_REQUERIDA|Generá un nuevo código desde NODAL App.");
					return false;
				}

				string payload = "{\"code\":\"" + Escape(settings.PairingCode) + "\",\"connectorVersion\":\"" + ConnectorVersion + "\"}";
				using (HttpResponseMessage response = await PostAsync("/api/integrations/ninjatrader/pair", payload, null))
				{
					if (!response.IsSuccessStatusCode || !await ApplySessionAsync(response, true))
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

		private async Task<bool> LinkAdditionalDestinationAsync()
		{
			string payload = "{\"code\":\"" + Escape(settings.PairingCode) + "\"}";
			using (HttpResponseMessage response = await PostAsync("/api/integrations/ninjatrader/link", payload, settings.AccessToken))
			{
				if (response.StatusCode == HttpStatusCode.Conflict)
				{
					// The server has confirmed this one-time code cannot be used again.
					// Preserve the authenticated session and resume regular telemetry.
					settings.ClearPairingCode();
					Write("VINCULO_ADICIONAL_DESCARTADO|El codigo vencio, ya fue usado o el destino ya estaba vinculado. La conexion existente continua.");
					return true;
				}
				if (!response.IsSuccessStatusCode)
				{
					Write("VINCULO_ADICIONAL_RECHAZADO|El código venció, ya fue utilizado o el destino ya está vinculado.");
					return false;
				}
			}
			settings.ClearPairingCode();
			Write("VINCULO_ADICIONAL_OK|La instalación conserva sus vínculos y el destino se controla desde NODAL.");
			return true;
		}

		private async Task<bool> ApplySessionAsync(HttpResponseMessage response, bool clearPairingCode)
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

			settings.ApplySession(connectorId, accessToken, accessExpiration.ToUniversalTime(), refreshToken, refreshExpiration.ToUniversalTime(), clearPairingCode);
			return true;
		}

		private async Task<HttpResponseMessage> PostAsync(string path, string payload, string bearer)
		{
			if (!NodalReliableTelemetry.IsAllowedOrigin(settings.BaseUrl)) throw new InvalidOperationException("Destino NODAL no autorizado.");
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
					ConnectionName(account), AccountConnectionStatus(account), account.Name,
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
				+ "\"connectionStatus\":\"" + Escape(AccountConnectionStatus(account)) + "\","
				+ "\"providerName\":\"" + Escape(ProviderName(account)) + "\","
				+ "\"cashValue\":" + Number(Read(account, AccountItem.CashValue)) + ","
				+ "\"netLiquidation\":" + Number(Read(account, AccountItem.NetLiquidation)) + ","
				+ "\"totalCashBalance\":" + Number(Read(account, AccountItem.TotalCashBalance)) + ","
				+ "\"realizedProfitLoss\":" + Number(Read(account, AccountItem.RealizedProfitLoss)) + ","
				+ "\"unrealizedProfitLoss\":" + Number(Read(account, AccountItem.UnrealizedProfitLoss))
				+ "}";
		}

		private static List<Account> ConnectedAccounts()
		{
			// Providers do not expose their inventory consistently: some accounts only
			// appear in Account.All while others only appear in connection.Accounts.
			// Merge both read-only views and keep only accounts whose own connection is
			// currently active. This prevents either provider behaviour from hiding a
			// connected broker account.
			List<Account> accounts = new List<Account>();
			lock (Account.All)
				accounts.AddRange(Account.All.Where(IsConnectedAccount));

			List<Connection> connections;
			lock (Connection.Connections)
				connections = Connection.Connections
					.Where(connection => connection != null
						&& connection.Status == NinjaTrader.Cbi.ConnectionStatus.Connected)
					.ToList();

			foreach (Connection connection in connections)
			{
				lock (connection.Accounts)
					accounts.AddRange(connection.Accounts.Where(IsConnectedAccount));
			}

			return accounts
				.GroupBy(
					account => ConnectionName(account) + "\u0000" + account.Name,
					StringComparer.Ordinal)
				.Select(group => group.First())
				.ToList();
		}

		private static bool IsConnectedAccount(Account account)
		{
			return account != null
				&& account.Connection != null
				&& account.Connection.Status == NinjaTrader.Cbi.ConnectionStatus.Connected;
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
				: value.ToString("R", CultureInfo.InvariantCulture);
		}

		private static string ConnectionName(Account account)
		{
			return account.Connection == null || account.Connection.Options == null ? "sin_conexion" : account.Connection.Options.Name;
		}

		private static string ProviderName(Account account)
		{
			return account.Connection == null || account.Connection.Options == null ? "sin_proveedor" : account.Connection.Options.Provider.ToString();
		}

		private static string AccountConnectionStatus(Account account)
		{
			return account.Connection == null ? "sin_conexion" : account.Connection.Status.ToString();
		}

		private static string Escape(string value)
		{
			string json = new JavaScriptSerializer().Serialize(value ?? string.Empty);
			return json.Substring(1, json.Length - 2);
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
			public bool HasBaseUrl { get { return NodalReliableTelemetry.IsAllowedOrigin(BaseUrl); } }
			public bool HasPairingCode { get { return !string.IsNullOrWhiteSpace(PairingCode); } }
			public bool HasFreshAccess { get { return !string.IsNullOrWhiteSpace(AccessToken) && AccessExpiresAtUtc > DateTime.UtcNow.AddMinutes(1); } }
			public bool HasRefresh { get { return !string.IsNullOrWhiteSpace(RefreshToken) && RefreshExpiresAtUtc > DateTime.UtcNow.AddMinutes(1); } }

			public static ConnectorSettings Load()
			{
				string configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NinjaTrader 8", "NODAL", ConfigFileName);
				ConnectorSettings result = new ConnectorSettings(configPath);
				if (!File.Exists(configPath)) return result;
				Dictionary<string, string> values = ReadValues(configPath);

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

			public static string ReadInstalledSourceVersion()
			{
				string configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NinjaTrader 8", "NODAL", ConfigFileName);
				if (!File.Exists(configPath)) return string.Empty;
				string value;
				return ReadValues(configPath).TryGetValue("InstalledSourceVersion", out value)
					? value
					: string.Empty;
			}

			private static Dictionary<string, string> ReadValues(string configPath)
			{
				return File.ReadAllLines(configPath)
					.Select(line => new { Line = line, Separator = line.IndexOf('=') })
					.Where(item => item.Separator > 0)
					.GroupBy(item => item.Line.Substring(0, item.Separator).Trim(), StringComparer.OrdinalIgnoreCase)
					.ToDictionary(
						group => group.Key,
						group => group.Last().Line.Substring(group.Last().Separator + 1).Trim(),
						StringComparer.OrdinalIgnoreCase);
			}

			public void ApplySession(string connectorId, string accessToken, DateTime accessExpiresAtUtc, string refreshToken, DateTime refreshExpiresAtUtc, bool clearPairingCode)
			{
				ConnectorId = connectorId;
				AccessToken = accessToken;
				AccessExpiresAtUtc = accessExpiresAtUtc;
				RefreshToken = refreshToken;
				RefreshExpiresAtUtc = refreshExpiresAtUtc;
				if (clearPairingCode) PairingCode = string.Empty;
				Save();
			}

			public void ClearAccess()
			{
				AccessToken = string.Empty;
				AccessExpiresAtUtc = DateTime.MinValue;
				Save();
			}

			public void ClearSession()
			{
				ConnectorId = string.Empty;
				AccessToken = string.Empty;
				AccessExpiresAtUtc = DateTime.MinValue;
				RefreshToken = string.Empty;
				RefreshExpiresAtUtc = DateTime.MinValue;
				Save();
			}

			public void ClearPairingCode()
			{
				PairingCode = string.Empty;
				Save();
			}

			private void Save()
			{
				Directory.CreateDirectory(Path.GetDirectoryName(path));
				// Encrypt the entire replacement before touching the valid file.
				string[] lines = new[] {
					"BaseUrl=" + (BaseUrl ?? string.Empty),
					"PairingCode=" + (PairingCode ?? string.Empty),
					"ConnectorId=" + (ConnectorId ?? string.Empty),
					"InstalledSourceVersion=" + ReadInstalledSourceVersion(),
					"AccessTokenProtected=" + Protect(AccessToken),
					"AccessExpiresAtUtc=" + AccessExpiresAtUtc.ToString("O", CultureInfo.InvariantCulture),
					"RefreshTokenProtected=" + Protect(RefreshToken),
					"RefreshExpiresAtUtc=" + RefreshExpiresAtUtc.ToString("O", CultureInfo.InvariantCulture)
				};
				string temporaryPath = path + ".tmp." + Guid.NewGuid().ToString("N");
				try
				{
					File.WriteAllLines(temporaryPath, lines);
					if (File.Exists(path)) File.Replace(temporaryPath, path, path + ".bak");
					else File.Move(temporaryPath, path);
				}
				finally { if (File.Exists(temporaryPath)) File.Delete(temporaryPath); }
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
