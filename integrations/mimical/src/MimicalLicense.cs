using System;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace NinjaTrader.NinjaScript.AddOns
{
    [DataContract]
    internal sealed class MimicalActivationRequest
    {
        [DataMember(Name = "activationScope")] public string ActivationScope;
        [DataMember(Name = "code")] public string Code;
        [DataMember(Name = "installationKey")] public string InstallationKey;
        [DataMember(Name = "mimicalVersion")] public string MimicalVersion;
    }

    [DataContract]
    internal sealed class MimicalActivationResponse
    {
        [DataMember(Name = "installationId")] public string InstallationId;
        [DataMember(Name = "installationToken")] public string InstallationToken;
        [DataMember(Name = "ownerLabel")] public string OwnerLabel;
    }

    [DataContract]
    internal sealed class MimicalValidationRequest
    {
        [DataMember(Name = "installationKey")] public string InstallationKey;
    }

    [DataContract]
    internal sealed class MimicalValidationResponse
    {
        [DataMember(Name = "allowNewCycles")] public bool AllowNewCycles;
        [DataMember(Name = "ownerLabel")] public string OwnerLabel;
    }

    internal sealed class MimicalLicenseResult
    {
        public bool Authorized;
        public bool ServiceUnavailable;
        public string Message;
        public string OwnerLabel;
    }

    internal sealed class MimicalLicenseClient
    {
        private const string ApiBase = "https://app.nodaltrading.com";
#if MIMICAL_IDENTITY
        private const string ActivationScope = "identity";
#else
        private const string ActivationScope = "personal";
#endif
        private const string Version = "1.1.0.2";
        private readonly string licensePath;
        private string installationId;
        private string installationToken;

        public MimicalLicenseClient(string settingsFolder)
        {
            Directory.CreateDirectory(settingsFolder);
            licensePath = Path.Combine(settingsFolder, "license.txt");
            InstallationKey = Guid.NewGuid().ToString("D");
            Load();
            Save();
        }

        public string InstallationKey { get; private set; }
        public bool HasCredential { get { return !String.IsNullOrWhiteSpace(installationToken); } }

        public void ActivateAsync(string code, Action<MimicalLicenseResult> completed)
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    MimicalActivationResponse response = Post<MimicalActivationRequest, MimicalActivationResponse>(
                        "/api/integrations/mimical/activate",
                        new MimicalActivationRequest { ActivationScope = ActivationScope, Code = code, InstallationKey = InstallationKey, MimicalVersion = Version },
                        null);
                    installationId = response.InstallationId;
                    installationToken = response.InstallationToken;
                    Save();
                    completed(new MimicalLicenseResult { Authorized = true, OwnerLabel = response.OwnerLabel, Message = "MIMICAL vinculado con NODAL" });
                }
                catch (WebException ex)
                {
                    completed(WebFailure(ex, "El código es inválido, venció o ya fue utilizado."));
                }
                catch (Exception ex)
                {
                    completed(new MimicalLicenseResult { ServiceUnavailable = true, Message = "No se pudo vincular: " + ex.Message });
                }
            });
        }

        public void ValidateAsync(Action<MimicalLicenseResult> completed)
        {
            if (!HasCredential)
            {
                completed(new MimicalLicenseResult { Message = "Ingresá el código generado en NODAL App." });
                return;
            }
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    MimicalValidationResponse response = Post<MimicalValidationRequest, MimicalValidationResponse>(
                        "/api/integrations/mimical/validate",
                        new MimicalValidationRequest { InstallationKey = InstallationKey },
                        installationToken);
                    completed(new MimicalLicenseResult
                    {
                        Authorized = response.AllowNewCycles,
                        OwnerLabel = response.OwnerLabel,
                        Message = response.AllowNewCycles ? "Licencia NODAL activa" : "Tu acceso NODAL no está habilitado"
                    });
                }
                catch (WebException ex)
                {
                    completed(WebFailure(ex, "MIMICAL no está autorizado para iniciar ciclos nuevos."));
                }
                catch (Exception ex)
                {
                    completed(new MimicalLicenseResult { ServiceUnavailable = true, Message = "No se pudo verificar NODAL: " + ex.Message });
                }
            });
        }

        private static MimicalLicenseResult WebFailure(WebException exception, string deniedMessage)
        {
            HttpWebResponse response = exception.Response as HttpWebResponse;
            bool unavailable = response == null || (int)response.StatusCode >= 500;
            return new MimicalLicenseResult
            {
                Authorized = false,
                ServiceUnavailable = unavailable,
                Message = unavailable ? "NODAL no está disponible. No se iniciarán ciclos nuevos." : deniedMessage
            };
        }

        private static TResponse Post<TRequest, TResponse>(string path, TRequest body, string bearer)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(ApiBase + path);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Accept = "application/json";
            request.Timeout = 12000;
            request.ReadWriteTimeout = 12000;
            if (!String.IsNullOrWhiteSpace(bearer)) request.Headers[HttpRequestHeader.Authorization] = "Bearer " + bearer;
            DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(TRequest));
            using (Stream stream = request.GetRequestStream()) serializer.WriteObject(stream, body);
            using (WebResponse response = request.GetResponse())
            using (Stream stream = response.GetResponseStream())
            {
                DataContractJsonSerializer responseSerializer = new DataContractJsonSerializer(typeof(TResponse));
                return (TResponse)responseSerializer.ReadObject(stream);
            }
        }

        private void Load()
        {
            try
            {
                if (!File.Exists(licensePath)) return;
                foreach (string line in File.ReadAllLines(licensePath))
                {
                    int split = line.IndexOf('=');
                    if (split <= 0) continue;
                    string key = line.Substring(0, split);
                    string value = line.Substring(split + 1);
                    Guid parsedInstallationKey;
                    if (key == "InstallationKey" && Guid.TryParse(value, out parsedInstallationKey)) InstallationKey = value;
                    else if (key == "InstallationId") installationId = value;
                    else if (key == "Token") installationToken = Unprotect(value);
                }
            }
            catch
            {
                installationId = null;
                installationToken = null;
            }
        }

        private void Save()
        {
            string temporary = licensePath + ".tmp";
            File.WriteAllLines(temporary, new[]
            {
                "InstallationKey=" + InstallationKey,
                "InstallationId=" + (installationId ?? String.Empty),
                "Token=" + (String.IsNullOrWhiteSpace(installationToken) ? String.Empty : Protect(installationToken))
            }, new UTF8Encoding(false));
            File.Copy(temporary, licensePath, true);
            File.Delete(temporary);
        }

        private static string Protect(string value)
        {
            byte[] clear = Encoding.UTF8.GetBytes(value);
            return Convert.ToBase64String(ProtectedData.Protect(clear, null, DataProtectionScope.CurrentUser));
        }

        private static string Unprotect(string value)
        {
            if (String.IsNullOrWhiteSpace(value)) return null;
            byte[] protectedValue = Convert.FromBase64String(value);
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(protectedValue, null, DataProtectionScope.CurrentUser));
        }
    }
}
