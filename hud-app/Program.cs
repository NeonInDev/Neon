using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NeonHud
{
    public class Config
    {
        public string url = "";
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
        TextBox urlBox;
        TextBox keyBox;
        Button connectBtn;

        public MainForm(Config cfg, string configPath)
        {
            this.cfg = cfg;
            this.configPath = configPath;
            Text = "NEON · HUD Desktop";
            Width = 1380;
            Height = 900;
            MinimumSize = new Size(1000, 650);
            WindowState = FormWindowState.Normal;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(8, 12, 22);
            Icon = null;

            // Painel de conexao
            Panel top = new Panel();
            top.Dock = DockStyle.Top;
            top.Height = 64;
            top.BackColor = Color.FromArgb(14, 18, 30);
            top.Padding = new Padding(10, 12, 10, 8);
            Controls.Add(top);

            Label urlLabel = new Label();
            urlLabel.Text = "URL do HUD:";
            urlLabel.ForeColor = Color.White;
            urlLabel.AutoSize = true;
            urlLabel.Location = new Point(10, 24);
            top.Controls.Add(urlLabel);

            urlBox = new TextBox();
            urlBox.Text = cfg.url;
            urlBox.Width = 320;
            urlBox.Location = new Point(95, 20);
            top.Controls.Add(urlBox);

            Label keyLabel = new Label();
            keyLabel.Text = "Chave:";
            keyLabel.ForeColor = Color.White;
            keyLabel.AutoSize = true;
            keyLabel.Location = new Point(425, 24);
            top.Controls.Add(keyLabel);

            keyBox = new TextBox();
            keyBox.Text = cfg.chave;
            keyBox.Width = 200;
            keyBox.PasswordChar = '*';
            keyBox.Location = new Point(470, 20);
            top.Controls.Add(keyBox);

            connectBtn = new Button();
            connectBtn.Text = "Conectar";
            connectBtn.Width = 100;
            connectBtn.Location = new Point(690, 18);
            connectBtn.BackColor = Color.FromArgb(108, 92, 231);
            connectBtn.ForeColor = Color.White;
            connectBtn.FlatStyle = FlatStyle.Flat;
            connectBtn.Click += Connect_Click;
            top.Controls.Add(connectBtn);

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            Controls.Add(web);
            top.BringToFront();

            web.CoreWebView2InitializationCompleted += (s, e) => {
                if (e.IsSuccess && !string.IsNullOrEmpty(cfg.chave))
                {
                    web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('hud_key', '" + cfg.chave.Replace("'", "\\'") + "');");
                }
            };

            if (!string.IsNullOrEmpty(cfg.url))
            {
                Connect();
            }
        }

        async void Connect_Click(object sender, EventArgs e)
        {
            Connect();
        }

        async void Connect()
        {
            string url = urlBox.Text.Trim();
            string chave = keyBox.Text.Trim();
            if (string.IsNullOrEmpty(url)) { MessageBox.Show("Digite a URL do HUD."); return; }
            if (string.IsNullOrEmpty(chave)) { MessageBox.Show("Digite a chave (MASTER_KEY do .env)."); return; }
            cfg.url = url;
            cfg.chave = chave;
            try
            {
                File.WriteAllText(configPath, cfg.ToJson(), Encoding.UTF8);
            }
            catch { }
            connectBtn.Text = "Conectando...";
            connectBtn.Enabled = false;
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Path.GetTempPath(), "neon_hud_wv2"));
                await web.EnsureCoreWebView2Async(env);
                web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                web.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = true;
                web.CoreWebView2.Settings.UserAgent = web.CoreWebView2.Settings.UserAgent.Replace("Edg/", "Chrome/");
                // Zoom inicial (110%) para o HUD preencher melhor a janela no desktop
                try { web.ZoomFactor = 1.1; } catch { }
                await web.CoreWebView2.ExecuteScriptAsync("localStorage.setItem('hud_key', '" + chave.Replace("'", "\\'") + "');");
                web.Source = new Uri(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Falha ao iniciar WebView2: " + ex.Message);
                connectBtn.Text = "Conectar";
                connectBtn.Enabled = true;
            }
        }
    }
}
