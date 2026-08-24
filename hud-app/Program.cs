using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NeonHud
{
    public class Config
    {
        public string url = "https://neon-world.tail7b15b0.ts.net:3443/hud";
        public string chave = "";

        public static Config FromJson(string json)
        {
            Config c = new Config();
            if (json == null) return c;
            foreach (string line in json.Replace("{", "").Replace("}", "").Split(','))
            {
                int idx = line.IndexOf(':');
                if (idx < 0) continue;
                string key = line.Substring(0, idx).Trim().Trim('"');
                string val = line.Substring(idx + 1).Trim().Trim('"');
                if (key == "url") c.url = val;
                else if (key == "chave") c.chave = val;
            }
            return c;
        }

        public string ToJson()
        {
            return "{\"url\":\"" + url.Replace("\"", "\\\"") + "\",\"chave\":\"" + chave.Replace("\"", "\\\"") + "\"}";
        }
    }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            string configPath = Path.Combine(exeDir, "neon_hud_config.json");
            Config cfg = new Config();
            if (File.Exists(configPath))
            {
                try { cfg = Config.FromJson(File.ReadAllText(configPath, Encoding.UTF8)); } catch { }
                if (cfg.url.StartsWith("http://") || string.IsNullOrEmpty(cfg.url))
                {
                    cfg.url = "https://neon-world.tail7b15b0.ts.net:3443/hud";
                }
            }

            using (MainForm form = new MainForm(cfg, configPath))
            {
                Application.Run(form);
            }
        }
    }

    public class MainForm : Form
    {
        WebView2 web;
        Config cfg;
        string configPath;
        string exeDir;
        string botDir;
        string apiHost = "127.0.0.1";
        string apiPorta = "3000";
        bool conectado = false;
        bool ligando = false;
        System.Windows.Forms.Timer sondagem;
        HttpClient http;
        Random rnd = new Random();

        public MainForm(Config cfg, string configPath)
        {
            this.cfg = cfg;
            this.configPath = configPath;
            exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            botDir = Path.GetFullPath(Path.Combine(exeDir, ".."));
            http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(3);

            LerEnv();

            Text = "NEON Â· HUD Desktop";
            Width = 1380;
            Height = 900;
            MinimumSize = new Size(1000, 650);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(8, 12, 22);
            Icon = null;

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            Controls.Add(web);

            web.CoreWebView2InitializationCompleted += Web_Pronto;
            web.WebMessageReceived += Web_Mensagem;

            this.Shown += async (s, e) =>
            {
                await InicializarWebView();
            };

            // sondagem periodica: se caiu, volta pra tela offline; se subiu, conecta
            sondagem = new System.Windows.Forms.Timer();
            sondagem.Interval = 4000;
            sondagem.Tick += async (s, e) => await Sondar();
            sondagem.Start();
        }

        void LerEnv()
        {
            try
            {
                string envPath = Path.Combine(botDir, ".env");
                if (!File.Exists(envPath)) return;
                foreach (string linha in File.ReadAllLines(envPath))
                {
                    int idx = linha.IndexOf('=');
                    if (idx < 0) continue;
                    string k = linha.Substring(0, idx).Trim();
                    string v = linha.Substring(idx + 1).Trim();
                    if (k == "API_HOST" && !string.IsNullOrEmpty(v)) apiHost = v;
                    else if (k == "API_PORT") apiPorta = v;
                }
            }
            catch { }
        }

        string UrlLocal()
        {
            return "http://" + apiHost + ":" + apiPorta + "/api/pc";
        }

        void Web_Pronto(object sender, CoreWebView2InitializationCompletedEventArgs e)
        {
            if (!e.IsSuccess) return;
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = true;
            try { web.CoreWebView2.Settings.UserAgent = web.CoreWebView2.Settings.UserAgent.Replace("Edg/", "Chrome/"); } catch { }
            try { web.ZoomFactor = 1.1; } catch { }
        }

        void Web_Mensagem(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg = "";
            try { msg = e.TryGetWebMessageAsString(); } catch { }
            if (msg == "ligar-neon" && !ligando && !conectado)
            {
                Task t1 = LigarNeon();
            }
            else if (msg == "tentar-conectar")
            {
                Task t2 = TentarConectar(true);
            }
        }

        async Task InicializarWebView()
        {
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Path.GetTempPath(), "neon_hud_wv2"));
                await web.EnsureCoreWebView2Async(env);
                if (!string.IsNullOrEmpty(cfg.chave))
                {
                    await web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('hud_key', '" + cfg.chave.Replace("'", "\\'") + "');");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Falha ao iniciar WebView2: " + ex.Message);
                return;
            }
            MostrarBoot();
            await TentarConectar(false);
        }

        // ============ TELAS LOCAIS (boot / offline / ligando) ============

        string Pagina(string tituloStatus, string textoBotao, string msgJs, bool mostraAnel)
        {
            string anel = mostraAnel
                ? "<div class='anel'><div class='anel2'></div><div class='miolo'>NEON</div></div>"
                : "<div class='anel parado'><div class='anel2'></div><div class='miolo'>NEON</div></div>";

            string botao = string.IsNullOrEmpty(textoBotao) ? "" :
                "<button onclick=\"window.chrome.webview.postMessage('" + msgJs + "')\">" + textoBotao + "</button>";

            return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>" +
                "*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}" +
                "body{width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
                "background:radial-gradient(ellipse at 50% 35%,#141428 0%,#05050c 70%);color:#cfc9ff;overflow:hidden}" +
                ".anel{position:relative;width:190px;height:190px;border-radius:50%;" +
                "border:4px solid transparent;border-top-color:#6c5ce7;border-right-color:#6c5ce733;" +
                "animation:girar 1.1s linear infinite;display:flex;align-items:center;justify-content:center;margin-bottom:34px;" +
                "box-shadow:0 0 60px rgba(108,92,231,.25)}" +
                ".anel.parado{animation:none;border-top-color:#3d3768}" +
                ".anel2{position:absolute;inset:22px;border-radius:50%;border:3px solid transparent;" +
                "border-bottom-color:#a29bfe;border-left-color:#a29bfe33;animation:girar .7s linear infinite reverse}" +
                ".anel.parado .anel2{animation:none;border-bottom-color:#3d3768}" +
                "@keyframes girar{to{transform:rotate(360deg)}}" +
                ".miolo{font-size:30px;font-weight:800;letter-spacing:5px;color:#fff;text-shadow:0 0 18px rgba(108,92,231,.9);" +
                "animation:pulsar 2s ease-in-out infinite}" +
                "@keyframes pulsar{50%{opacity:.55}}" +
                "h2{font-size:19px;letter-spacing:3px;color:#8d84e8;margin-bottom:10px;font-weight:600}" +
                ".pontos::after{content:'';animation:pontos 1.2s steps(4,end) infinite}" +
                "@keyframes pontos{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}" +
                "button{margin-top:26px;padding:15px 46px;font-size:17px;font-weight:700;letter-spacing:2px;color:#fff;" +
                "background:linear-gradient(135deg,#6c5ce7,#8e7cf3);border:none;border-radius:12px;cursor:pointer;" +
                "box-shadow:0 0 28px rgba(108,92,231,.55);transition:transform .12s,box-shadow .12s}" +
                "button:hover{transform:scale(1.06);box-shadow:0 0 44px rgba(108,92,231,.85)}" +
                "button:active{transform:scale(.97)}" +
                ".barra{width:280px;height:6px;background:#1d1b38;border-radius:3px;margin-top:30px;overflow:hidden}" +
                ".barra i{display:block;height:100%;width:40%;border-radius:3px;" +
                "background:linear-gradient(90deg,#6c5ce7,#a29bfe);animation:correr 1.15s ease-in-out infinite}" +
                "@keyframes correr{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}" +
                ".dica{margin-top:18px;font-size:12px;color:#4f4a78;letter-spacing:1px}" +
                "</style></head><body>" +
                anel +
                "<h2>" + tituloStatus + "<span class='pontos'></span></h2>" +
                botao +
                ((tituloStatus.IndexOf("LIGANDO", StringComparison.OrdinalIgnoreCase) >= 0) ? "<div class='barra'><i></i></div>" : "") +
                "<div class='dica'>NEONWORLD \u00B7 HUD DESKTOP</div>" +
                "</body></html>";
        }

        void MostrarBoot()
        {
            try { web.NavigateToString(Pagina("INICIALIZANDO SISTEMAS", "", "", true)); } catch { }
        }

        void MostrarOffline()
        {
            try { web.NavigateToString(Pagina("NEON OFFLINE", "\u26A1 LIGAR A NEON", "ligar-neon", false)); } catch { }
        }

        void MostrarLigando()
        {
            try { web.NavigateToString(Pagina("LIGANDO A NEON", "", "", true)); } catch { }
        }

        // ============ SONS ============

        void Tocar(string nome)
        {
            try
            {
                string wav = Path.Combine(exeDir, "sons", nome + ".wav");
                if (!File.Exists(wav)) return;
                var sp = new System.Media.SoundPlayer(wav);
                sp.Play();
            }
            catch { }
        }

        // ============ LIGAR A NEON ============

        async Task LigarNeon()
        {
            ligando = true;
            Tocar("ligar");
            MostrarLigando();
            try
            {
                var psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "index.js";
                psi.WorkingDirectory = botDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Nao consegui iniciar o node: " + ex.Message);
            }

            // espera ate 90 segundos subindo
            for (int i = 0; i < 60; i++)
            {
                await Task.Delay(1500);
                if (await NeonViva()) break;
            }

            ligando = false;
            if (await NeonViva())
            {
                Tocar("online");
                await NavegarHUD();
            }
            else
            {
                Tocar("erro");
                MostrarOffline();
            }
        }

        async Task<bool> NeonViva()
        {
            try
            {
                var resp = await http.GetAsync(UrlLocal());
                return resp.IsSuccessStatusCode || resp.StatusCode == System.Net.HttpStatusCode.Unauthorized || resp.StatusCode == System.Net.HttpStatusCode.Forbidden;
            }
            catch { return false; }
        }

        async Task NavegarHUD()
        {
            conectado = true;
            try
            {
                if (!string.IsNullOrEmpty(cfg.chave))
                {
                    await web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('hud_key', '" + cfg.chave.Replace("'", "\\'") + "');");
                }
                web.Source = new Uri(cfg.url);
            }
            catch
            {
                try { web.CoreWebView2.Navigate(cfg.url); } catch { }
            }
        }

        async Task TentarConectar(bool comSom)
        {
            if (await NeonViva())
            {
                if (comSom) Tocar("online");
                await NavegarHUD();
            }
            else
            {
                conectado = false;
                MostrarOffline();
            }
        }

        // vigia: se estava conectado e a Neon caiu, mostra offline de novo
        async Task Sondar()
        {
            if (!conectado || ligando) return;
            if (web.Source == null || cfg.url == null) return;
            try
            {
                string atual = "";
                try { atual = web.Source.ToString(); } catch { }
                if (atual.StartsWith("http") && !telaErroLocal(atual))
                {
                    // navegando o HUD remoto: testa vida local de leve
                    if (!(await NeonViva()))
                    {
                        conectado = false;
                        Tocar("desligar");
                        MostrarOffline();
                    }
                }
            }
            catch { }
        }

        bool telaErroLocal(string urlAtual)
        {
            return urlAtual.IndexOf("chrome-error", StringComparison.OrdinalIgnoreCase) >= 0
                || urlAtual.IndexOf("about:", StringComparison.OrdinalIgnoreCase) == 0
                || urlAtual.IndexOf("data:", StringComparison.OrdinalIgnoreCase) == 0;
        }
    }
}
