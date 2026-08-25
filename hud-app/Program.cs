using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NeonHud
{
    public class Config
    {
        public string url = "https://neon-world.tail7b15b0.ts.net:3443/hud";
        public string chave = "";
        public int x = -1, y = -1, largura = 1380, altura = 900;
        public bool maximizada = false;

        static string Valor(string linha)
        {
            int idx = linha.IndexOf(':');
            return idx < 0 ? "" : linha.Substring(idx + 1).Trim().Trim('"');
        }

        public static Config FromJson(string json)
        {
            Config c = new Config();
            if (json == null) return c;
            foreach (string linha0 in json.Replace("{", "").Replace("}", "").Split(','))
            {
                string linha = linha0.Trim();
                int idx = linha.IndexOf(':');
                if (idx < 0) continue;
                string key = linha.Substring(0, idx).Trim().Trim('"');
                string val = Valor(linha);
                try
                {
                    if (key == "url") c.url = val;
                    else if (key == "chave") c.chave = val;
                    else if (key == "x") c.x = int.Parse(val);
                    else if (key == "y") c.y = int.Parse(val);
                    else if (key == "largura") c.largura = int.Parse(val);
                    else if (key == "altura") c.altura = int.Parse(val);
                    else if (key == "maximizada") c.maximizada = val == "true";
                }
                catch { }
            }
            return c;
        }

        public string ToJson()
        {
            return "{\"url\":\"" + url.Replace("\"", "\\\"") +
                   "\",\"chave\":\"" + chave.Replace("\"", "\\\"") +
                   "\",\"x\":" + x + ",\"y\":" + y +
                   ",\"largura\":" + largura + ",\"altura\":" + altura +
                   ",\"maximizada\":" + (maximizada ? "true" : "false") + "}";
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
        bool saiuDeVerdade = false;
        bool avisouTray = false;
        System.Windows.Forms.Timer sondagem;
        HttpClient http;
        NotifyIcon tray;
        ContextMenuStrip menuTray;
        Panel header;
        Label logo;
        Button btnMin, btnMax, btnX;

        const int MARGEM = 7;

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        static extern bool ReleaseCapture();

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

        public MainForm(Config cfg, string configPath)
        {
            this.cfg = cfg;
            this.configPath = configPath;
            exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            botDir = Path.GetFullPath(Path.Combine(exeDir, ".."));
            http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(3);

            LerEnv();
            LogLinha("ygg_debug.log", "=== app abriu ===");

            Text = "NEON \u00B7 HUD";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(8, 12, 22);
            MinimumSize = new Size(900, 600);
            DoubleBuffered = true;

            // restaurar janela salva
            bool posValida = cfg.x >= -100 && cfg.y >= -100;
            if (posValida) { StartPosition = FormStartPosition.Manual; Location = new Point(cfg.x, cfg.y); }
            Size = new Size(cfg.largura, cfg.altura);
            if (cfg.maximizada) WindowState = FormWindowState.Maximized;

            try { Icon = new Icon(Path.Combine(exeDir, "neon.ico")); } catch { }
            try { KeyPreview = true; } catch { }

            MontarHeader();
            MontarWeb();
            MontarTray();

            sondagem = new System.Windows.Forms.Timer();
            sondagem.Interval = 4000;
            sondagem.Tick += async (s, e) => await Sondar();
            sondagem.Start();

            Shown += async (s, e) =>
            {
                LogLinha("ygg_debug.log", "evento Shown disparou");
                await InicializarWebView();
            };
        }

        void MontarHeader()
        {
            header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 38;
            header.BackColor = Color.FromArgb(12, 15, 28);
            Controls.Add(header);

            logo = new Label();
            logo.Text = "\u25CF  NEON \u00B7 HUD";
            logo.ForeColor = Color.FromArgb(162, 155, 254);
            logo.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            logo.AutoSize = true;
            logo.Location = new Point(14, 9);
            logo.Cursor = Cursors.Default;
            header.Controls.Add(logo);

            btnX = BotaoHeader("\u2715", 0);
            btnMax = BotaoHeader("\u25A1", 40);
            btnMin = BotaoHeader("\u2014", 80);
            btnMin.Click += (s, e) => WindowState = FormWindowState.Minimized;
            btnMax.Click += (s, e) =>
            {
                WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
            };
            btnX.Click += (s, e) => FecharParaTray();
            header.Controls.Add(btnX);
            header.Controls.Add(btnMax);
            header.Controls.Add(btnMin);
        }

        Button BotaoHeader(string texto, int offsetDaDireita)
        {
            Button b = new Button();
            b.Text = texto;
            b.Size = new Size(40, 38);
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = Color.FromArgb(12, 15, 28);
            b.ForeColor = Color.Gainsboro;
            b.Font = new Font("Segoe UI", 10F);
            b.Location = new Point(header.Width - 40 - offsetDaDireita, 0);
            b.TabStop = false;
            b.MouseEnter += (s, e) => { b.BackColor = Color.FromArgb(45, 45, 70); };
            b.MouseLeave += (s, e) => { b.BackColor = Color.FromArgb(12, 15, 28); };
            return b;
        }

        void MontarWeb()
        {
            web = new WebView2();
            web.Dock = DockStyle.Fill;
            Controls.Add(web);
            web.BringToFront();

            web.CoreWebView2InitializationCompleted += (s, e) =>
            {
                if (!e.IsSuccess) return;
                web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                web.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
                try { web.CoreWebView2.Settings.UserAgent = web.CoreWebView2.Settings.UserAgent.Replace("Edg/", "Chrome/"); } catch { }
                try { web.ZoomFactor = 1.1; } catch { }
            };
            web.WebMessageReceived += Web_Mensagem;
        }

        void MontarTray()
        {
            menuTray = new ContextMenuStrip();
            menuTray.Items.Add("Abrir HUD", null, (s, e) => Restaurar());
            menuTray.Items.Add("Reiniciar Neon", null, (s, e) => { if (!ligando) { Restaurar(); Task t = ReiniciarNeon(); } });
            menuTray.Items.Add(new ToolStripSeparator());
            menuTray.Items.Add("Iniciar com Windows", null, (s, e) => AlternarAutoStart((ToolStripMenuItem)s));
            menuTray.Items.Add("Servidor...", null, (s, e) => AbrirServidorDialog());
            menuTray.Items.Add(new ToolStripSeparator());
            menuTray.Items.Add("Sair", null, (s, e) => SairDeVerdade());

            tray = new NotifyIcon();
            try { tray.Icon = new Icon(Path.Combine(exeDir, "neon.ico")); } catch { tray.Icon = this.Icon; }
            tray.Text = "NEON \u00B7 HUD";
            tray.Visible = true;
            tray.ContextMenuStrip = menuTray;
            tray.DoubleClick += (s, e) => Restaurar();

            ((ToolStripMenuItem)menuTray.Items[3]).Checked = AutoStartLigado();
        }

        // ============ JANELA / CHROME ============

        protected override void WndProc(ref Message m)
        {
            const int WM_NCHITTEST = 0x84;
            if (m.Msg == WM_NCHITTEST && WindowState == FormWindowState.Normal && !DesignMode)
            {
                int lx = (short)((long)m.LParam & 0xFFFF);
                int ly = (short)(((long)m.LParam >> 16) & 0xFFFF);
                Point pt = PointToClient(new Point(lx, ly));
                Size sz = ClientSize;

                bool esq = pt.X <= MARGEM, dir = pt.X >= sz.Width - MARGEM;
                bool topo = pt.Y <= MARGEM, base_ = pt.Y >= sz.Height - MARGEM;

                if (topo && esq) { m.Result = (IntPtr)13; return; }          // HTTOPLEFT
                if (topo && dir) { m.Result = (IntPtr)14; return; }          // HTTOPRIGHT
                if (base_ && esq) { m.Result = (IntPtr)16; return; }         // HTBOTTOMLEFT
                if (base_ && dir) { m.Result = (IntPtr)17; return; }         // HTBOTTOMRIGHT
                if (esq) { m.Result = (IntPtr)10; return; }                  // HTLEFT
                if (dir) { m.Result = (IntPtr)11; return; }                  // HTRIGHT
                if (topo) { m.Result = (IntPtr)12; return; }                 // HTTOP
                if (base_) { m.Result = (IntPtr)15; return; }                // HTBOTTOM

                // arrastar pelo header (fora dos botoes)
                if (pt.Y <= header.Height && pt.X < header.Width - 130)
                {
                    m.Result = (IntPtr)2;                                    // HTCAPTION
                    return;
                }
            }
            base.WndProc(ref m);
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.F11)
            {
                FormBorderStyle = FormBorderStyle == FormBorderStyle.None
                    ? FormBorderStyle.Sizable
                    : FormBorderStyle.None;
                if (FormBorderStyle == FormBorderStyle.None)
                    WindowState = FormWindowState.Maximized;
                else
                    WindowState = FormWindowState.Normal;
                return true;
            }
            if (keyData == (Keys.Control | Keys.R))
            {
                try { if (web.CoreWebView2 != null) web.CoreWebView2.Reload(); } catch { }
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            // reposiciona botoes do header quando a largura muda
            if (btnX != null)
            {
                btnMin.Left = header.Width - 120;
                btnMax.Left = header.Width - 80;
                btnX.Left = header.Width - 40;
            }
        }

        void FecharParaTray()
        {
            Hide();
            if (!avisouTray)
            {
                avisouTray = true;
                try { tray.ShowBalloonTip(2500, "NEON continua aqui", "O HUD ficou na bandeja. Duplo clique pra abrir.", ToolTipIcon.Info); } catch { }
            }
        }

        void Restaurar()
        {
            Show();
            WindowState = WindowState == FormWindowState.Minimized ? FormWindowState.Normal : WindowState;
            Activate();
        }

        void SairDeVerdade()
        {
            saiuDeVerdade = true;
            SalvarJanela();
            try { tray.Visible = false; } catch { }
            Application.Exit();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!saiuDeVerdade && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                FecharParaTray();
                return;
            }
            SalvarJanela();
            base.OnFormClosing(e);
        }

        void SalvarJanela()
        {
            try
            {
                if (WindowState == FormWindowState.Normal)
                {
                    cfg.x = Location.X; cfg.y = Location.Y;
                    cfg.largura = Width; cfg.altura = Height;
                }
                cfg.maximizada = WindowState == FormWindowState.Maximized;
                File.WriteAllText(configPath, cfg.ToJson(), Encoding.UTF8);
            }
            catch { }
        }

        // ============ AUTO START / SERVIDOR ============

        string ChaveRun() { return "Software\\Microsoft\\Windows\\CurrentVersion\\Run"; }

        bool AutoStartLigado()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(ChaveRun(), false))
                    return k != null && k.GetValue("NeonHud") != null;
            }
            catch { return false; }
        }

        void AlternarAutoStart(ToolStripMenuItem item)
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(ChaveRun(), true))
                {
                    if (k == null) return;
                    if (k.GetValue("NeonHud") != null) { k.DeleteValue("NeonHud", false); item.Checked = false; }
                    else { k.SetValue("NeonHud", "\"" + Application.ExecutablePath + "\""); item.Checked = true; }
                }
            }
            catch { }
        }

        void AbrirServidorDialog()
        {
            Form d = new Form();
            d.Text = "Servidor NEONWORLD";
            d.Size = new Size(460, 210);
            d.FormBorderStyle = FormBorderStyle.FixedDialog;
            d.StartPosition = FormStartPosition.CenterParent;
            d.MaximizeBox = false; d.MinimizeBox = false;
            d.BackColor = Color.FromArgb(14, 18, 30);

            Label l1 = new Label(); l1.Text = "URL do HUD:"; l1.ForeColor = Color.White; l1.Location = new Point(15, 18); l1.AutoSize = true;
            TextBox t1 = new TextBox(); t1.Text = cfg.url; t1.Width = 400; t1.Location = new Point(15, 40);
            Label l2 = new Label(); l2.Text = "Chave:"; l2.ForeColor = Color.White; l2.Location = new Point(15, 72); l2.AutoSize = true;
            TextBox t2 = new TextBox(); t2.Text = cfg.chave; t2.Width = 400; t2.Location = new Point(15, 94); t2.PasswordChar = '\u25CF';

            Button ok = new Button();
            ok.Text = "Salvar"; ok.Width = 110; ok.Height = 34;
            ok.Location = new Point(305, 132);
            ok.BackColor = Color.FromArgb(108, 92, 231); ok.ForeColor = Color.White; ok.FlatStyle = FlatStyle.Flat;
            ok.Click += (s, e) =>
            {
                cfg.url = t1.Text.Trim();
                cfg.chave = t2.Text.Trim();
                try { File.WriteAllText(configPath, cfg.ToJson(), Encoding.UTF8); } catch { }
                d.Close();
            };

            d.Controls.AddRange(new Control[] { l1, t1, l2, t2, ok });
            d.ShowDialog(this);
        }

        // ============ INFRA ============

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

        void LogLinha(string arquivo, string linha)
        {
            try { File.AppendAllText(Path.Combine(botDir, arquivo), DateTime.Now.ToString("[HH:mm:ss] ") + linha + Environment.NewLine); } catch { }
        }

        string UrlLocal() { return "http://" + apiHost + ":" + apiPorta + "/api/pc"; }

        void Web_Mensagem(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg = "";
            try { msg = e.TryGetWebMessageAsString(); } catch { }
            if (msg == "ligar-neon" && !ligando && !conectado)
            {
                Task t = ReiniciarNeon();
            }
        }

        async System.Threading.Tasks.Task InicializarWebView()
        {
            CoreWebView2Environment env = null;
            string pasta = Path.Combine(Path.GetTempPath(), "neon_hud_wv2");
            bool ok = false;
            Exception falha = null;
            LogLinha("ygg_debug.log", "criando environment webview2");
            try
            {
                env = await CoreWebView2Environment.CreateAsync(null, pasta);
                ok = true;
                LogLinha("ygg_debug.log", "environment ok");
            }
            catch (Exception ex)
            {
                falha = ex;
                LogLinha("ygg_debug.log", "environment falhou: " + ex.Message);
            }
            if (!ok)
            {
                try
                {
                    env = await CoreWebView2Environment.CreateAsync(null, pasta + "_" + DateTime.Now.Ticks);
                    ok = true;
                    LogLinha("ygg_debug.log", "environment ok (pasta alternativa)");
                }
                catch (Exception ex) { falha = ex; LogLinha("ygg_debug.log", "fallback falhou: " + ex.Message); }
            }
            if (!ok)
            {
                MessageBox.Show("Falha ao iniciar WebView2: " + (falha != null ? falha.Message : "?"));
                return;
            }
            try
            {
                await web.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                MessageBox.Show("WebView2 nao inicializou: " + ex.Message);
                return;
            }
            if (!string.IsNullOrEmpty(cfg.chave))
            {
                await web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('hud_key', '" + cfg.chave.Replace("'", "\\'") + "');");
            }
            // toda abertura reinicia a Neon com o ritual completo
            await ReiniciarNeon();
        }

        // ============ TELAS LOCAIS ============

        string Pagina(string tituloStatus, string textoBotao, string msgJs, bool mostraAnel)
        {
            string anel = mostraAnel
                ? "<div class='anel'><div class='anel2'></div><div class='miolo'>NEON</div></div>"
                : "<div class='anel parado'><div class='anel2'></div><div class='miolo'>NEON</div></div>";

            string botao = string.IsNullOrEmpty(textoBotao) ? "" :
                "<button onclick=\"window.chrome.webview.postMessage('" + msgJs + "')\">" + textoBotao + "</button>";

            bool barra = tituloStatus.IndexOf("INICIANDO", StringComparison.OrdinalIgnoreCase) >= 0;

            return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>" +
                "*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}" +
                "body{width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
                "background:radial-gradient(ellipse at 50% 35%,#141428 0%,#05050c 70%);color:#cfc9ff;overflow:hidden}" +
                ".anel{position:relative;width:190px;height:190px;border-radius:50%;" +
                "border:4px solid transparent;border-top-color:#6c5ce7;border-right-color:#6c5ce733;" +
                "animation:girar 1.7s linear infinite;display:flex;align-items:center;justify-content:center;margin-bottom:34px;" +
                "box-shadow:0 0 60px rgba(108,92,231,.25)}" +
                ".anel.parado{animation:none;border-top-color:#3d3768}" +
                ".anel2{position:absolute;inset:22px;border-radius:50%;border:3px solid transparent;" +
                "border-bottom-color:#a29bfe;border-left-color:#a29bfe33;animation:girar 1.05s linear infinite reverse}" +
                ".anel.parado .anel2{animation:none;border-bottom-color:#3d3768}" +
                "@keyframes girar{to{transform:rotate(360deg)}}" +
                ".miolo{font-size:30px;font-weight:800;letter-spacing:5px;color:#fff;text-shadow:0 0 18px rgba(108,92,231,.9);" +
                "animation:pulsar 2.8s ease-in-out infinite}" +
                "@keyframes pulsar{50%{opacity:.55}}" +
                "h2{font-size:19px;letter-spacing:3px;color:#8d84e8;margin-bottom:10px;font-weight:600}" +
                ".pontos::after{content:'';animation:pontos 1.8s steps(4,end) infinite}" +
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
                (barra ? "<div class='barra'><i></i></div>" : "") +
                "<div class='dica'>NEONWORLD \u00B7 HUD DESKTOP</div>" +
                "</body></html>";
        }

        void MostrarBoot()
        {
            try { web.NavigateToString(Pagina("NEON INICIANDO NOVAMENTE", "", "", true)); } catch { }
        }

        void MostrarOffline()
        {
            try { web.NavigateToString(Pagina("NEON OFFLINE", "\u26A1 LIGAR A NEON", "ligar-neon", false)); } catch { }
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

        // ============ REINICIAR NEON ============

        async System.Threading.Tasks.Task<bool> NeonViva()
        {
            try
            {
                var resp = await http.GetAsync(UrlLocal());
                return resp.IsSuccessStatusCode || resp.StatusCode == System.Net.HttpStatusCode.Unauthorized || resp.StatusCode == System.Net.HttpStatusCode.Forbidden;
            }
            catch { return false; }
        }

        async System.Threading.Tasks.Task ReiniciarNeon()
        {
            LogLinha("ygg_debug.log", "ReiniciarNeon iniciou");
            ligando = true;
            Tocar("ligar");
            MostrarBoot();
            DateTime inicio = DateTime.UtcNow;

            if (await NeonViva())
            {
                LogLinha("ygg_debug.log", "neon viva - pedindo pra parar");
                try
                {
                    var req = new HttpRequestMessage(HttpMethod.Post, UrlLocal().Replace("/api/pc", "/api/bot/parar"));
                    req.Headers.Add("X-Hud-Key", cfg.chave);
                    var respParar = await http.SendAsync(req);
                    LogLinha("ygg_debug.log", "parar respondeu " + (int)respParar.StatusCode);
                }
                catch (Exception ex) { LogLinha("ygg_debug.log", "parar erro: " + ex.Message); }
                await Task.Delay(2500);
            }
            else
            {
                LogLinha("ygg_debug.log", "neon nao estava viva");
            }

            try
            {
                var psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "index.js";
                psi.WorkingDirectory = botDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                Process proc = Process.Start(psi);
                proc.OutputDataReceived += (s2, e2) => { if (!string.IsNullOrEmpty(e2.Data)) LogSaida(".neon_out.log", e2.Data); };
                proc.ErrorDataReceived += (s2, e2) => { if (!string.IsNullOrEmpty(e2.Data)) LogSaida(".neon_err.log", e2.Data); };
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                LogLinha("ygg_debug.log", "node spawnado pid " + proc.Id);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Nao consegui iniciar o node: " + ex.Message);
            }

            bool viva = false;
            while ((DateTime.UtcNow - inicio).TotalSeconds < 90)
            {
                await Task.Delay(1500);
                if ((DateTime.UtcNow - inicio).TotalSeconds >= 8 && await NeonViva())
                {
                    viva = true;
                    break;
                }
            }

            ligando = false;
            if (viva)
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

        void LogSaida(string arquivo, string linha)
        {
            try { File.AppendAllText(Path.Combine(botDir, arquivo), linha + Environment.NewLine); } catch { }
        }

        async System.Threading.Tasks.Task NavegarHUD()
        {
            conectado = true;
            try
            {
                if (!string.IsNullOrEmpty(cfg.chave))
                {
                    await web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('hud_key', '" + cfg.chave.Replace("'", "\\'") + "');");
                }
                string separador = cfg.url.IndexOf('?') >= 0 ? "&" : "?";
                web.Source = new Uri(cfg.url + separador + "hud_refresh=" + DateTime.UtcNow.Ticks);
            }
            catch
            {
                try { web.CoreWebView2.Navigate(cfg.url); } catch { }
            }
        }

        async System.Threading.Tasks.Task Sondar()
        {
            if (!conectado || ligando) return;
            try
            {
                string atual = "";
                try { atual = web.Source.ToString(); } catch { }
                bool telaLocal = atual.IndexOf("chrome-error", StringComparison.OrdinalIgnoreCase) >= 0
                    || atual.IndexOf("about:", StringComparison.OrdinalIgnoreCase) == 0
                    || atual.IndexOf("data:", StringComparison.OrdinalIgnoreCase) == 0;
                if (!telaLocal && !(await NeonViva()))
                {
                    conectado = false;
                    Tocar("desligar");
                    MostrarOffline();
                }
            }
            catch { }
        }
    }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            bool nova;
            Mutex mutex = new Mutex(true, "NeonHudInstanciaUnica", out nova);
            if (!nova) return; // ja tem um YGG aberto

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string exeDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
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
            mutex.ReleaseMutex();
        }
    }
}
