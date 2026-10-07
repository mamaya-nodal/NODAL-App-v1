using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Globalization;
using System.Threading;
using System.Web.Script.Serialization;
using NinjaTrader.NinjaScript.AddOns;

public static class NodalTransportTests
{
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private static int checks;
    private static void Check(bool value, string message) { checks++; if (!value) throw new Exception(message); }
    private static string Protect(string value) { return Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value), null, DataProtectionScope.CurrentUser)); }
    private static string Unprotect(string value) { return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value), null, DataProtectionScope.CurrentUser)); }
    private static string Event(string id, string extra)
    {
        return Json.Serialize(new { eventId = id, kind = "execution", occurredAt = "2026-10-07T10:00:00Z", accountName = "LFE123",
            connectionName = "test", providerName = "test", instrument = "NQ", executionId = id, orderId = id,
            orderAction = "Buy", marketPosition = "Long", price = 24100.125, quantity = 1, extra = extra });
    }
    private static string Receipt(string batch, List<NodalReliableTelemetry.Entry> entries, string status)
    {
        return Json.Serialize(new { protocol = 2, batchId = batch, receipts = entries.Select(e => new { eventId = e.Id, sha256 = e.Hash, status = status }).ToArray() });
    }
    private static void Reject(Action action) { bool rejected = false; try { action(); } catch { rejected = true; } Check(rejected, "Must reject invalid response"); }
    public static string Run(string directory)
    {
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, "queue");
        string first = Event("first", "control\n\t\u0001 and accented á");
        File.WriteAllLines(path, new[] { Protect(first), "broken-protection", Protect("{\"eventId\":\"missing-fields\"}") });
        var spool = new NodalReliableTelemetry(path, Protect, Unprotect);
        var entries = spool.Peek(50);
        Check(entries.Count == 1 && entries[0].Payload == first, "Legacy import preserves full payload");
        Check(spool.QuarantineCount == 2, "Corrupt rows quarantined without blocking");
        Check(File.ReadAllLines(path).Length == 3, "Original queue preserved");
        Check(!File.ReadAllText(entries[0].Path).Contains("LFE123"), "DPAPI encrypted at rest");
        string batch = new string('a', 32);
        Reject(() => spool.ApplyReceipts(batch, entries, "{\"accepted\":true}"));
        Reject(() => spool.ApplyReceipts(batch, entries, Receipt("wrong", entries, "persisted")));
        Reject(() => spool.ApplyReceipts(batch, entries, Receipt(batch, entries, "persisted").Replace(entries[0].Hash, new string('f', 64))));
        Reject(() => spool.ApplyReceipts(batch, entries, Receipt(batch, entries, "unknown")));
        Check(spool.Peek(50).Count == 1, "No invalid acknowledgement deletes data");
        spool.Append(Event("second", ""));
        Check(spool.ApplyReceipts(batch, entries, Receipt(batch, entries, "pending")) == 0, "Pending retained");
        Check(spool.Peek(1)[0].Id == "second", "Unresolved record does not block newer record");
        Check(spool.ApplyReceipts(batch, entries, Receipt(batch, entries, "persisted")) == 1, "Valid receipt removes exactly one");
        Check(spool.Peek(50).Single().Id == "second", "Concurrent append preserved");
        Check(spool.ApplyReceipts(batch, entries, Receipt(batch, entries, "persisted")) == 0, "Repeated response harmless");
        var second = spool.Peek(50);
        spool.ApplyReceipts(batch, second, Receipt(batch, second, "conflict"));
        Check(spool.Peek(50).Count == 0 && spool.QuarantineCount == 3, "Conflict preserved in quarantine");
        var restarted = new NodalReliableTelemetry(path, Protect, Unprotect);
        Check(restarted.Peek(50).Count == 0, "Restart does not reimport acknowledged legacy data");
        spool.Append(Event("same", "one")); spool.Append(Event("same", "two"));
        Check(spool.Peek(50).Count == 1, "Conflicting event IDs isolated into separate attempts");
        string largePath = Path.Combine(directory, "large");
        var large = new NodalReliableTelemetry(largePath, Protect, Unprotect);
        for (int i = 0; i < 1400; i++) large.Append(Event("large-" + i, new string('x', 6000)));
        Check(Directory.GetFiles(largePath + ".v2", "*.event").Length == 1400, "No old 8 MiB truncation");
        Check(Directory.GetFiles(largePath + ".v2", "*.event").Sum(f => new FileInfo(f).Length) > 8 * 1024 * 1024, "Test actually exceeds old capacity");
        Check(large.Peek(50).Count == 50, "Batch remains bounded");
        foreach (string origin in new[] { "http://app.nodaltrading.com", "https://evil.test", "https://app.nodaltrading.com.evil.test", "https://user@app.nodaltrading.com", "https://app.nodaltrading.com:444", "https://app.nodaltrading.com/path", "https://app.nodaltrading.com/?token=x" })
            Check(!NodalReliableTelemetry.IsAllowedOrigin(origin), "Reject untrusted destination " + origin);
        Check(NodalReliableTelemetry.IsAllowedOrigin("https://app.nodaltrading.com"), "Official production allowed");
        Check(NodalReliableTelemetry.IsAllowedOrigin("https://nodal-app-preview.vercel.app/"), "Official existing preview allowed");
        return "PASS: " + checks + " transport checks, DPAPI, legacy migration, invalid receipts, conflicts, >8 MiB queue and HTTPS destinations.";
    }
}
