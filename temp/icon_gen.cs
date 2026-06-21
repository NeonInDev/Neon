using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;

public class IconGen {
    public static void Make(string path) {
        int[] sizes = { 16, 32, 48, 64, 128 };
        using (var ms = new MemoryStream()) {
            using (var writer = new BinaryWriter(ms)) {
                writer.Write((ushort)0); writer.Write((ushort)1);
                writer.Write((ushort)sizes.Length);
                int offset = 6 + sizes.Length * 16;
                var datas = new byte[sizes.Length][];

                for (int i = 0; i < sizes.Length; i++) {
                    int s = sizes[i];
                    byte[] data;
                    using (var bmp = new Bitmap(s, s))
                    using (var g = Graphics.FromImage(bmp)) {
                        g.SmoothingMode = SmoothingMode.HighQuality;
                        g.Clear(Color.FromArgb(10, 10, 15));

                        float cx = s / 2f, cy = s / 2f;
                        float r = s * 0.4f;

                        using (var brush = new SolidBrush(Color.FromArgb(25, 0, 212, 255)))
                            g.FillEllipse(brush, cx - r, cy - r, r * 2, r * 2);
                        using (var brush = new SolidBrush(Color.FromArgb(50, 0, 212, 255)))
                            g.FillEllipse(brush, cx - r * 0.5f, cy - r * 0.5f, r, r);

                        float penW = Math.Max(1.5f, s * 0.10f);
                        using (var pen = new Pen(Color.FromArgb(0, 212, 255), penW) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                        using (var pen2 = new Pen(Color.FromArgb(180, 255, 255, 255), penW * 0.3f) { StartCap = LineCap.Round, EndCap = LineCap.Round }) {
                            float x1 = cx - s * 0.28f, y1 = cy - s * 0.35f;
                            float x2 = cx - s * 0.28f, y2 = cy + s * 0.35f;
                            float x3 = cx + s * 0.28f, y3 = cy - s * 0.35f;
                            float x4 = cx + s * 0.28f, y4 = cy + s * 0.35f;

                            g.DrawLine(pen, x1, y1, x2, y2);
                            g.DrawLine(pen, x2, y2, x3, y3);
                            g.DrawLine(pen, x3, y3, x4, y4);
                            g.DrawLine(pen, x2, y2, x4, y4);
                            g.DrawLine(pen2, x1, y1, x2, y2);
                            g.DrawLine(pen2, x2, y2, x3, y3);
                            g.DrawLine(pen2, x3, y3, x4, y4);
                            g.DrawLine(pen2, x2, y2, x4, y4);
                        }

                        using (var brush = new SolidBrush(Color.FromArgb(0, 212, 255)))
                            g.FillEllipse(brush, cx + s * 0.12f, cy + s * 0.25f, s * 0.1f, s * 0.1f);

                        using (var bms = new MemoryStream()) {
                            bmp.Save(bms, System.Drawing.Imaging.ImageFormat.Png);
                            data = bms.ToArray();
                        }
                    }

                    writer.Write((byte)(s >= 256 ? 0 : s));
                    writer.Write((byte)(s >= 256 ? 0 : s));
                    writer.Write((byte)0); writer.Write((byte)0);
                    writer.Write((ushort)1); writer.Write((ushort)32);
                    writer.Write((uint)data.Length);
                    writer.Write((uint)offset);
                    offset += data.Length;
                    datas[i] = data;
                }
                foreach (var d in datas) writer.Write(d);
            }
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllBytes(path, ms.ToArray());
        }
    }
}
