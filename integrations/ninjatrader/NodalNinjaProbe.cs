// NODAL Ninja Probe v0.1
// Read-only diagnostic Add On for NinjaTrader 8.1.8.2+.
// It does not submit, change, cancel, or flatten orders, and it makes no network requests.

#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NinjaTrader.Cbi;
using NinjaTrader.Code;
using NinjaTrader.NinjaScript;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
	public class NodalNinjaProbe : AddOnBase
	{
		private readonly HashSet<Account> subscribedAccounts = new HashSet<Account>();
		private readonly Dictionary<string, double> lastReportedValues = new Dictionary<string, double>();

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Name = "NODAL Ninja Probe";
				Description = "Lectura local de conexiones, cuentas y saldos para diagnostico NODAL.";
			}
			else if (State == State.Active)
			{
				Account.AccountStatusUpdate += OnAccountStatusUpdate;
				Write("INICIO|modo=solo_lectura|red=desactivada|ordenes=desactivadas");
				RefreshInventory("inicio");
			}
			else if (State == State.Terminated)
			{
				Account.AccountStatusUpdate -= OnAccountStatusUpdate;
				foreach (Account account in subscribedAccounts.ToList())
					account.AccountItemUpdate -= OnAccountItemUpdate;
				subscribedAccounts.Clear();
				Write("FIN|NODAL Ninja Probe detenido");
			}
		}

		private void OnAccountStatusUpdate(object sender, AccountStatusEventArgs e)
		{
			RefreshInventory("cambio_de_estado");
		}

		private void RefreshInventory(string reason)
		{
			List<Account> accounts;
			lock (Account.All)
				accounts = Account.All.ToList();

			List<Account> candidateAccounts = accounts.Where(IsNodalCandidateAccount).ToList();
			Write(string.Format(
				CultureInfo.InvariantCulture,
				"INVENTARIO|motivo={0}|detectadas={1}|candidatas_nodal={2}",
				reason,
				accounts.Count,
				candidateAccounts.Count));
			foreach (Account account in candidateAccounts)
			{
				Subscribe(account);
				WriteAccountSnapshot(account);
			}
		}

		private void Subscribe(Account account)
		{
			if (subscribedAccounts.Contains(account))
				return;

			account.AccountItemUpdate += OnAccountItemUpdate;
			subscribedAccounts.Add(account);
		}

		private void OnAccountItemUpdate(object sender, AccountItemEventArgs e)
		{
			if (!IsNodalCandidateAccount(e.Account) || !IsObserved(e.AccountItem))
				return;

			string valueKey = string.Format(
				CultureInfo.InvariantCulture,
				"{0}|{1}|{2}",
				ConnectionName(e.Account),
				e.Account.Name,
				e.AccountItem);
			double priorValue;
			if (lastReportedValues.TryGetValue(valueKey, out priorValue) && Math.Abs(priorValue - e.Value) < 0.005d)
				return;

			lastReportedValues[valueKey] = e.Value;

			Write(string.Format(
				CultureInfo.InvariantCulture,
				"ACTUALIZACION|hora={0:O}|conexion={1}|proveedor={2}|cuenta={3}|campo={4}|valor={5:0.00}",
				e.Time,
				ConnectionName(e.Account),
				ProviderName(e.Account),
				e.Account.Name,
				e.AccountItem,
				e.Value));
		}

		private void WriteAccountSnapshot(Account account)
		{
			Write(string.Format(
				CultureInfo.InvariantCulture,
				"CUENTA|conexion={0}|proveedor={1}|estado={2}|cuenta={3}|CashValue={4}|NetLiquidation={5}|TotalCashBalance={6}|RealizedPnL={7}|UnrealizedPnL={8}",
				ConnectionName(account),
				ProviderName(account),
				ConnectionStatus(account),
				account.Name,
				Read(account, AccountItem.CashValue),
				Read(account, AccountItem.NetLiquidation),
				Read(account, AccountItem.TotalCashBalance),
				Read(account, AccountItem.RealizedProfitLoss),
				Read(account, AccountItem.UnrealizedProfitLoss)));
		}

		private static bool IsObserved(AccountItem accountItem)
		{
			return accountItem == AccountItem.CashValue
				|| accountItem == AccountItem.NetLiquidation
				|| accountItem == AccountItem.TotalCashBalance
				|| accountItem == AccountItem.RealizedProfitLoss
				|| accountItem == AccountItem.UnrealizedProfitLoss;
		}

		private static bool IsNodalCandidateAccount(Account account)
		{
			if (account == null || account.Connection == null || account.Connection.Options == null)
				return false;

			if (!string.Equals(ConnectionStatus(account), "Connected", StringComparison.OrdinalIgnoreCase))
				return false;

			// A connected account named "Sim..." may be a prop-firm evaluation or
			// simulated funded account. It must be shown as unpaired, never silently
			// omitted. Only accounts without an active connection are excluded here.
			return true;
		}

		private static double Read(Account account, AccountItem accountItem)
		{
			try
			{
				return account.Get(accountItem, Currency.UsDollar);
			}
			catch
			{
				return double.NaN;
			}
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

		private static void Write(string message)
		{
			Output.Process("[NODAL PROBE] " + message, PrintTo.OutputTab1);
		}
	}
}
