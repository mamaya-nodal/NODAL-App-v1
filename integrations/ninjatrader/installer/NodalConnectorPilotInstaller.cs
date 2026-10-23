using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace Nodal.NinjaInstaller
{
    internal static class Program
    {
        private const string ConnectorVersion = "0.16";
        private const string LegacyConfigName = "nodal-ninja-connector.config";
        private const string RuntimeConfigName = "nodal-ninja-connector-v2.config";
        private const string RuntimeDllName = "Nodal.NinjaConnector.dll";
        private const string EmbeddedRuntimeName = "Nodal.NinjaConnector.dll";

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                string testRoot = ReadTestRoot(args);
                bool silent = args.Any(value => value.Equals("--silent", StringComparison.OrdinalIgnoreCase));
                bool noLaunch = args.Any(value => value.Equals("--no-launch", StringComparison.OrdinalIgnoreCase));
                if (testRoot != null)
                {
                    Install(testRoot, null, !noLaunch);
                    Console.WriteLine("PILOT_INSTALL_OK|version=" + ConnectorVersion + "|root=" + testRoot);
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                if (silent)
                {
                    Install(DefaultNinjaRoot(), FindNinjaExecutable(), !noLaunch);
                    return 0;
                }

                Application.Run(new InstallerForm());
                return 0;
            }
            catch (Exception exception)
            {
                if (args.Any(value => value.Equals("--silent", StringComparison.OrdinalIgnoreCase)))
                    Console.Error.WriteLine("PILOT_INSTALL_ERROR|" + exception.Message);
                else
                    MessageBox.Show(exception.Message, "NODAL Connector", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static string ReadTestRoot(string[] args)
        {
            int index = Array.FindIndex(args, value => value.Equals("--test-root", StringComparison.OrdinalIgnoreCase));
            if (index < 0) return null;
            if (!string.Equals(Environment.GetEnvironmentVariable("NODAL_INSTALLER_TEST"), "1", StringComparison.Ordinal))
                throw new InvalidOperationException("El modo de prueba no esta habilitado.");
            if (index + 1 >= args.Length || string.IsNullOrWhiteSpace(args[index + 1]))
                throw new InvalidOperationException("Falta la carpeta de prueba.");
            return Path.GetFullPath(args[index + 1]);
        }

        private static string DefaultNinjaRoot()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NinjaTrader 8");
        }

        private static string FindNinjaExecutable()
        {
            string[] candidates =
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "NinjaTrader 8", "bin", "NinjaTrader.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "NinjaTrader 8", "bin", "NinjaTrader.exe")
            };
            return candidates.FirstOrDefault(File.Exists);
        }

        internal static InstallResult Install(string ninjaRoot, string ninjaExecutable, bool launch)
        {
            if (Process.GetProcessesByName("NinjaTrader").Length > 0)
                throw new InvalidOperationException("Cerra NinjaTrader antes de continuar. El instalador no modifica archivos mientras esta abierto.");
            if (!Directory.Exists(ninjaRoot))
                throw new InvalidOperationException("No se encontro NinjaTrader 8 en Documentos.");

            string nodalDirectory = Path.Combine(ninjaRoot, "NODAL");
            string customDirectory = Path.Combine(ninjaRoot, "bin", "Custom");
            string legacyConfigPath = Path.Combine(nodalDirectory, LegacyConfigName);
            string runtimeConfigPath = Path.Combine(nodalDirectory, RuntimeConfigName);
            string sourceConfigPath = File.Exists(runtimeConfigPath) ? runtimeConfigPath : legacyConfigPath;
            string runtimeDllPath = Path.Combine(customDirectory, RuntimeDllName);

            if (!File.Exists(sourceConfigPath))
                throw new InvalidOperationException("No se encontro un conector NODAL ya vinculado. Este piloto actualiza instalaciones existentes; no crea una vinculacion nueva.");

            List<string> sourceLines = File.ReadAllLines(sourceConfigPath, Encoding.UTF8).ToList();
            Dictionary<string, string> values = ParseValues(sourceLines);
            ValidateExistingSession(values);

            Directory.CreateDirectory(nodalDirectory);
            Directory.CreateDirectory(customDirectory);
            string stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
            string backupDirectory = Path.Combine(nodalDirectory, "installer-backups", stamp);
            Directory.CreateDirectory(backupDirectory);

            List<BackupEntry> backups = new List<BackupEntry>();
            try
            {
                Backup(runtimeConfigPath, backupDirectory, backups);
                Backup(runtimeDllPath, backupDirectory, backups);
                if (File.Exists(legacyConfigPath)) Backup(legacyConfigPath, backupDirectory, backups);

                List<string> runtimeLines = new List<string>(sourceLines);
                SetValue(runtimeLines, "BaseUrl", NormalizeOfficialBaseUrl(values["BaseUrl"]));
                SetValue(runtimeLines, "PairingCode", string.Empty);
                SetValue(runtimeLines, "InstalledSourceVersion", ConnectorVersion);
                WriteAtomic(runtimeConfigPath, runtimeLines);

                byte[] runtimeBytes = ReadEmbeddedRuntime();
                WriteAtomic(runtimeDllPath, runtimeBytes);

                if (File.Exists(legacyConfigPath))
                {
                    List<string> legacyLines = File.ReadAllLines(legacyConfigPath, Encoding.UTF8).ToList();
                    SetValue(legacyLines, "BaseUrl", string.Empty);
                    SetValue(legacyLines, "PairingCode", string.Empty);
                    SetValue(legacyLines, "DisabledByNodalInstaller", stamp);
                    WriteAtomic(legacyConfigPath, legacyLines);
                }

                string digest = Sha256(runtimeBytes);
                WriteInstallLog(nodalDirectory, "INSTALLED", stamp, digest, backupDirectory);

                if (launch && !string.IsNullOrWhiteSpace(ninjaExecutable) && File.Exists(ninjaExecutable))
                    Process.Start(new ProcessStartInfo(ninjaExecutable) { UseShellExecute = true });

                return new InstallResult(ConnectorVersion, runtimeDllPath, backupDirectory, digest, launch && File.Exists(ninjaExecutable ?? string.Empty));
            }
            catch
            {
                Restore(backups);
                WriteInstallLog(nodalDirectory, "ROLLED_BACK", stamp, string.Empty, backupDirectory);
                throw;
            }
        }

        private static void ValidateExistingSession(Dictionary<string, string> values)
        {
            string[] required = { "BaseUrl", "ConnectorId", "RefreshTokenProtected", "RefreshExpiresAtUtc" };
            foreach (string key in required)
                if (!values.ContainsKey(key) || string.IsNullOrWhiteSpace(values[key]))
                    throw new InvalidOperationException("La vinculacion existente esta incompleta (" + key + "). Genera una vinculacion nueva desde NODAL antes de instalar.");

            Guid connectorId;
            if (!Guid.TryParse(values["ConnectorId"], out connectorId))
                throw new InvalidOperationException("La vinculacion existente no tiene un identificador valido.");
            DateTime refreshExpiration;
            if (!DateTime.TryParse(values["RefreshExpiresAtUtc"], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out refreshExpiration))
                throw new InvalidOperationException("La vinculacion existente tiene una fecha de sesion invalida.");
            if (refreshExpiration.ToUniversalTime() <= DateTime.UtcNow)
                throw new InvalidOperationException("La vinculacion existente vencio. Genera un codigo nuevo desde NODAL; este piloto no reemplaza una sesion vencida.");
            NormalizeOfficialBaseUrl(values["BaseUrl"]);
        }

        private static string NormalizeOfficialBaseUrl(string value)
        {
            string normalized = (value ?? string.Empty).Trim().TrimEnd('/');
            if (!normalized.Equals("https://app.nodaltrading.com", StringComparison.OrdinalIgnoreCase) &&
                !normalized.Equals("https://nodal-app-preview.vercel.app", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("La instalacion existente no apunta a un dominio oficial de NODAL.");
            // Preview remains accepted only as a migration source. Every pilot
            // installation finishes on the definitive production origin.
            return "https://app.nodaltrading.com";
        }

        private static Dictionary<string, string> ParseValues(IEnumerable<string> lines)
        {
            Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string line in lines)
            {
                int separator = line.IndexOf('=');
                if (separator <= 0) continue;
                values[line.Substring(0, separator).Trim()] = line.Substring(separator + 1).Trim();
            }
            return values;
        }

        private static void SetValue(List<string> lines, string key, string value)
        {
            int first = -1;
            for (int index = lines.Count - 1; index >= 0; index--)
            {
                int separator = lines[index].IndexOf('=');
                if (separator <= 0 || !lines[index].Substring(0, separator).Trim().Equals(key, StringComparison.OrdinalIgnoreCase)) continue;
                if (first < 0)
                {
                    lines[index] = key + "=" + value;
                    first = index;
                }
                else lines.RemoveAt(index);
            }
            if (first < 0) lines.Add(key + "=" + value);
        }

        private static byte[] ReadEmbeddedRuntime()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(EmbeddedRuntimeName))
            {
                if (stream == null) throw new InvalidOperationException("El instalador esta incompleto: falta el modulo del conector.");
                using (MemoryStream memory = new MemoryStream())
                {
                    stream.CopyTo(memory);
                    return memory.ToArray();
                }
            }
        }

        private static void Backup(string target, string backupDirectory, List<BackupEntry> backups)
        {
            bool existed = File.Exists(target);
            string backup = Path.Combine(backupDirectory, backups.Count.ToString("D2", CultureInfo.InvariantCulture) + "-" + Path.GetFileName(target));
            if (existed) File.Copy(target, backup, true);
            backups.Add(new BackupEntry(target, backup, existed));
        }

        private static void Restore(IEnumerable<BackupEntry> backups)
        {
            foreach (BackupEntry entry in backups.Reverse())
            {
                try
                {
                    if (entry.Existed) File.Copy(entry.Backup, entry.Target, true);
                    else if (File.Exists(entry.Target)) File.Delete(entry.Target);
                }
                catch { }
            }
        }

        private static void WriteAtomic(string path, IEnumerable<string> lines)
        {
            WriteAtomic(path, new UTF8Encoding(false).GetBytes(string.Join(Environment.NewLine, lines) + Environment.NewLine));
        }

        private static void WriteAtomic(string path, byte[] bytes)
        {
            string temporary = path + ".tmp." + Guid.NewGuid().ToString("N");
            using (FileStream stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                stream.Write(bytes, 0, bytes.Length);
                stream.Flush(true);
            }
            if (File.Exists(path)) File.Replace(temporary, path, path + ".atomic.bak", true);
            else File.Move(temporary, path);
        }

        private static string Sha256(byte[] bytes)
        {
            using (SHA256 sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", string.Empty);
        }

        private static void WriteInstallLog(string nodalDirectory, string status, string stamp, string digest, string backupDirectory)
        {
            string line = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + "|" + status + "|version=" + ConnectorVersion + "|sha256=" + digest + "|backup=" + backupDirectory;
            File.AppendAllLines(Path.Combine(nodalDirectory, "installer.log"), new[] { line }, new UTF8Encoding(false));
        }

        private sealed class BackupEntry
        {
            internal BackupEntry(string target, string backup, bool existed) { Target = target; Backup = backup; Existed = existed; }
            internal string Target { get; private set; }
            internal string Backup { get; private set; }
            internal bool Existed { get; private set; }
        }

        internal sealed class InstallResult
        {
            internal InstallResult(string version, string dllPath, string backupDirectory, string digest, bool launched)
            {
                Version = version; DllPath = dllPath; BackupDirectory = backupDirectory; Digest = digest; Launched = launched;
            }
            internal string Version { get; private set; }
            internal string DllPath { get; private set; }
            internal string BackupDirectory { get; private set; }
            internal string Digest { get; private set; }
            internal bool Launched { get; private set; }
        }

        private sealed class InstallerForm : Form
        {
            private readonly Label status;
            private readonly Button install;
            private readonly CheckBox openNinja;

            internal InstallerForm()
            {
                Text = "NODAL Connector 0.16 - Piloto";
                ClientSize = new Size(640, 390);
                FormBorderStyle = FormBorderStyle.FixedDialog;
                MaximizeBox = false;
                StartPosition = FormStartPosition.CenterScreen;
                BackColor = Color.FromArgb(10, 13, 11);
                ForeColor = Color.WhiteSmoke;
                Font = new Font("Segoe UI", 10F);

                Label brand = NewLabel("NODAL TRADING", 30, 24, 570, 26, Color.FromArgb(143, 255, 42), 11F, FontStyle.Bold);
                Label title = NewLabel("Actualizar conector NinjaTrader", 30, 62, 570, 46, Color.White, 23F, FontStyle.Bold);
                Label body = NewLabel("Piloto privado para actualizar una vinculacion existente a la version 0.16. Conserva cuentas, vinculos, historial, credenciales y cola pendiente.", 30, 120, 570, 62, Color.Gainsboro, 10F, FontStyle.Regular);
                body.AutoSize = false;

                Panel card = new Panel { Left = 30, Top = 196, Width = 580, Height = 76, BackColor = Color.FromArgb(22, 29, 24) };
                card.Controls.Add(NewLabel("Requisitos", 18, 10, 520, 22, Color.White, 10F, FontStyle.Bold));
                card.Controls.Add(NewLabel("NinjaTrader 8 instalado, conector ya vinculado y NinjaTrader cerrado.", 18, 38, 530, 22, Color.Silver, 9F, FontStyle.Regular));

                openNinja = new CheckBox { Left = 30, Top = 288, Width = 400, Height = 24, Text = "Abrir NinjaTrader al terminar", Checked = true, ForeColor = Color.WhiteSmoke };
                install = new Button { Left = 350, Top = 325, Width = 260, Height = 42, Text = "Instalar actualizacion 0.16", BackColor = Color.FromArgb(139, 247, 43), ForeColor = Color.Black, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 10F, FontStyle.Bold) };
                install.FlatAppearance.BorderSize = 0;
                install.Click += InstallClicked;
                status = NewLabel("Todavia no se modifico ningun archivo.", 30, 330, 300, 34, Color.Silver, 9F, FontStyle.Regular);
                status.AutoSize = false;

                Controls.Add(brand); Controls.Add(title); Controls.Add(body); Controls.Add(card); Controls.Add(openNinja); Controls.Add(status); Controls.Add(install);
            }

            private static Label NewLabel(string text, int left, int top, int width, int height, Color color, float size, FontStyle style)
            {
                return new Label { Text = text, Left = left, Top = top, Width = width, Height = height, ForeColor = color, Font = new Font("Segoe UI", size, style), AutoSize = false };
            }

            private void InstallClicked(object sender, EventArgs eventArgs)
            {
                install.Enabled = false;
                status.Text = "Instalando y creando respaldo...";
                Application.DoEvents();
                try
                {
                    InstallResult result = Install(DefaultNinjaRoot(), FindNinjaExecutable(), openNinja.Checked);
                    status.ForeColor = Color.FromArgb(143, 255, 42);
                    status.Text = "Actualizacion instalada correctamente.";
                    MessageBox.Show(
                        "NODAL Connector " + result.Version + " quedo instalado.\n\n" +
                        "La instalacion anterior se conservo en:\n" + result.BackupDirectory + "\n\n" +
                        (result.Launched ? "NinjaTrader se esta abriendo." : "Abri NinjaTrader para activar el conector."),
                        "Instalacion completa",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    install.Text = "Instalado";
                }
                catch (Exception exception)
                {
                    status.ForeColor = Color.FromArgb(255, 150, 150);
                    status.Text = "No se aplicaron cambios incompletos.";
                    MessageBox.Show(exception.Message, "No se pudo instalar", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    install.Enabled = true;
                }
            }
        }
    }
}
