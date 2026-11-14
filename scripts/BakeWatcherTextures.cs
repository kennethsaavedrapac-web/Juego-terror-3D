using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Resamples the supplied concept islands onto the EXISTING sphere UVs. No new
// anatomical artwork or mesh is generated. Every PBR map uses identical samples.
public static class BakeWatcherTextures {
    const int Size = 1024, Gutter = 8;
    sealed class Pixels {
        public byte[] Data;
        public Pixels(string path) {
            using (var source = new Bitmap(path))
            using (var rgba = new Bitmap(Size, Size, PixelFormat.Format32bppArgb)) {
                if (source.Width != Size || source.Height != Size) throw new Exception("Expected 1024px source: " + path);
                using (var g = Graphics.FromImage(rgba)) g.DrawImageUnscaled(source, 0, 0);
                var bits = rgba.LockBits(new Rectangle(0, 0, Size, Size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                Data = new byte[Size * Size * 4];
                Marshal.Copy(bits.Scan0, Data, 0, Data.Length);
                rgba.UnlockBits(bits);
            }
        }
        public double Read(double x, double y, int channel) {
            int ix = (int)x, iy = (int)y;
            double fx = x - ix, fy = y - iy;
            int i = (iy * Size + ix) * 4 + channel;
            return (Data[i] * (1-fx) + Data[i+4] * fx) * (1-fy)
                 + (Data[i+Size*4] * (1-fx) + Data[i+Size*4+4] * fx) * fy;
        }
    }
    sealed class Tile {
        public string Name; public int X,Y,W,H;
        // Rows: source-image y, left x, right x, always inside ONE island.
        public double[][] Front, Back;
        public Tile(string name,int x,int y,int w,int h,double[][] front,double[][] back) {
            Name=name;X=x;Y=y;W=w;H=h;Front=front;Back=back;
        }
    }
    static double[] Row(double y,double left,double right) { return new[]{y,left,right}; }
    static double[][] Strip(double y0,double y1,double left,double right) { return new[]{Row(y0,left,right),Row(y1,left,right)}; }
    static readonly Tile[] Tiles = {
        new Tile("head",0,0,512,512,new[]{Row(14,183,226),Row(40,125,285),Row(90,105,295),Row(150,110,300),Row(200,127,280),Row(250,156,250),Row(300,181,225),Row(315,193,218)},Strip(40,95,150,255)),
        new Tile("torso",512,0,256,512,new[]{Row(95,420,575),Row(190,413,575),Row(280,414,555),Row(370,435,555)},new[]{Row(70,635,828),Row(170,641,828),Row(270,655,821),Row(345,679,816)}),
        new Tile("upperArm",768,0,256,256,new[]{Row(280,24,137),Row(360,38,113),Row(450,45,94)},new[]{Row(405,795,865),Row(500,789,843),Row(600,786,831)}),
        new Tile("forearm",768,256,256,256,new[]{Row(490,41,92),Row(620,43,82),Row(755,47,72)},new[]{Row(650,783,810),Row(760,781,810),Row(895,787,810)}),
        new Tile("thigh",0,512,256,256,new[]{Row(465,252,326),Row(560,263,328),Row(665,272,325)},new[]{Row(450,645,718),Row(560,663,732),Row(650,673,730)}),
        new Tile("shin",256,512,256,256,new[]{Row(710,267,326),Row(820,265,323),Row(950,254,331)},new[]{Row(710,680,722),Row(830,681,720),Row(960,680,728)}),
        new Tile("palm",512,512,256,256,new[]{Row(638,497,576),Row(669,503,571),Row(694,518,564)},new[]{Row(848,493,576),Row(883,502,573),Row(911,519,564)}),
        new Tile("finger",768,512,256,256,Strip(551,606,542,549),Strip(754,804,534,541)),
        new Tile("neck",0,768,256,256,new[]{Row(28,447,501),Row(65,442,511),Row(95,438,521)},Strip(69,115,682,723)),
        new Tile("pelvis",256,768,256,256,new[]{Row(404,291,393),Row(455,283,410),Row(505,288,329)},Strip(290,350,693,780)),
        new Tile("foot",512,768,256,256,new[]{Row(823,137,178),Row(878,144,184),Row(925,149,187)},Strip(918,963,678,724)),
        new Tile("spine",768,768,256,256,Strip(95,313,733,753),Strip(95,313,733,753)),
    };
    static double Clamp(double v,double min,double max) { return Math.Max(min,Math.Min(max,v)); }
    static double Smooth(double x) { x=Clamp(x,0,1); return x*x*(3-2*x); }
    static void Coordinates(double[][] rows,double t,double side,out double x,out double y) {
        y=rows[0][0]+t*(rows[rows.Length-1][0]-rows[0][0]);
        int i=0; while(i<rows.Length-2 && y>rows[i+1][0])i++;
        double f=(y-rows[i][0])/(rows[i+1][0]-rows[i][0]);
        double left=rows[i][1]*(1-f)+rows[i+1][1]*f;
        double right=rows[i][2]*(1-f)+rows[i+1][2]*f;
        x=(left+right)*.5+side*(right-left)*.5;
    }
    static byte Byte(double value) { return (byte)Math.Round(Clamp(value,0,255)); }
    static void Save(byte[] bytes,string path) {
        using(var bitmap=new Bitmap(Size,Size,PixelFormat.Format32bppArgb)) {
            var bits=bitmap.LockBits(new Rectangle(0,0,Size,Size),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
            Marshal.Copy(bytes,0,bits.Scan0,bytes.Length); bitmap.UnlockBits(bits);
            if (path.EndsWith(".jpg")) {
                foreach (var codec in ImageCodecInfo.GetImageEncoders()) if(codec.MimeType=="image/jpeg") {
                    using(var parameters=new EncoderParameters(1)) {
                        parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,92L);
                        bitmap.Save(path,codec,parameters);
                    }
                }
            } else bitmap.Save(path,ImageFormat.Png);
        }
    }
    public static void Run(string source,string output,string layoutFile) {
        var albedo=new Pixels(Path.Combine(source,"monster_albedo.png"));
        var normal=new Pixels(Path.Combine(source,"monster_normal_opengl.png"));
        var rough=new Pixels(Path.Combine(source,"monster_roughness.png"));
        var ao=new Pixels(Path.Combine(source,"monster_ao.png"));
        var metallic=new Pixels(Path.Combine(source,"monster_metallic.png"));
        var mask=new Pixels(Path.Combine(source,"monster_uv_mask.png"));
        for(int i=0;i<metallic.Data.Length;i+=4) if(metallic.Data[i]!=0 || metallic.Data[i+1]!=0 || metallic.Data[i+2]!=0)
            throw new Exception("Metallic source is no longer uniformly black; review ORM packing.");
        var colors=new byte[Size*Size*4]; var normals=new byte[colors.Length];var orm=new byte[colors.Length];
        var layout=new StringBuilder("// Generated by scripts/bake-watcher-textures.ps1. Pixel rectangles exclude padding.\nexport const WATCHER_ATLAS_SIZE = 1024;\nexport const WATCHER_ATLAS_TILES = {\n");
        foreach(var tile in Tiles) {
            int invalid=0; string firstInvalid="";
            for(int py=0;py<tile.H;py++) for(int px=0;px<tile.W;px++) {
                double u=Clamp((px-Gutter)/(double)(tile.W-2*Gutter-1),0,1);
                double v=Clamp((py-Gutter)/(double)(tile.H-2*Gutter-1),0,1);
                double angle=u*Math.PI*2, sine=Math.Sin(angle), cosine=Math.Cos(angle);
                double t=(1-Math.Cos(v*Math.PI))*.5;
                double x,y; Coordinates(sine<0 ? tile.Front : tile.Back,t,sine<0 ? -cosine : cosine,out x,out y);
                // Shared neutral skin at hemisphere seams and poles avoids atlas
                // background, mirrored faces on the skull back and hard color seams.
                double seamX=197+16*cosine*Math.Sin(v*Math.PI),seamY=68+12*Math.Cos(v*Math.PI);
                double blend=Smooth(Math.Abs(sine)/.3)*Smooth(v/.055)*Smooth((1-v)/.055);
                if(mask.Read(x,y,0)<250) { invalid++; if(firstInvalid=="")firstInvalid=x.ToString("F1")+","+y.ToString("F1"); }
                int idx=((tile.Y+py)*Size+tile.X+px)*4;
                double r=albedo.Read(x,y,2)*blend+albedo.Read(seamX,seamY,2)*(1-blend);
                double g=albedo.Read(x,y,1)*blend+albedo.Read(seamX,seamY,1)*(1-blend);
                double b=albedo.Read(x,y,0)*blend+albedo.Read(seamX,seamY,0)*(1-blend);
                double l=.2126*r+.7152*g+.0722*b;
                // Restrained pallor: keep black cavities black and dried blood muted.
                colors[idx+2]=Byte((r*.7+l*.3)*1.2);
                colors[idx+1]=Byte((g*.7+l*.3)*1.23);
                colors[idx]=Byte((b*.7+l*.3)*1.25); colors[idx+3]=255;
                double nx=(normal.Read(x,y,2)/127.5-1)*-blend;
                double ny=(normal.Read(x,y,1)/127.5-1)*blend;
                double nz=(normal.Read(x,y,0)/127.5-1)*blend+(1-blend);
                double length=Math.Sqrt(nx*nx+ny*ny+nz*nz);
                normals[idx+2]=Byte((nx/length+1)*127.5);
                normals[idx+1]=Byte((ny/length+1)*127.5);
                normals[idx]=Byte((nz/length+1)*127.5);normals[idx+3]=255;
                orm[idx]=0; // B = nonmetallic; R = AO; G = roughness.
                orm[idx+1]=Byte(Math.Max(185,rough.Read(x,y,0)*blend+rough.Read(seamX,seamY,0)*(1-blend)));
                orm[idx+2]=Byte(ao.Read(x,y,0)*blend+ao.Read(seamX,seamY,0)*(1-blend));orm[idx+3]=255;
            }
            if(invalid>0)throw new Exception(tile.Name+": "+invalid+" samples outside UV island; first "+firstInvalid);
            layout.Append("  "+tile.Name+": ["+(tile.X+Gutter)+", "+(tile.Y+Gutter)+", "+(tile.W-2*Gutter)+", "+(tile.H-2*Gutter)+"],\n");
        }
        layout.Append("} as const;\nexport type WatcherSurface = keyof typeof WATCHER_ATLAS_TILES;\n");
        Directory.CreateDirectory(output);
        Save(colors,Path.Combine(output,"watcher-albedo.jpg")); Save(normals,Path.Combine(output,"watcher-normal.png")); Save(orm,Path.Combine(output,"watcher-orm.png"));
        File.WriteAllText(layoutFile,layout.ToString());
        Console.WriteLine("Baked 12 padded UV regions, 3 aligned 1024px maps, no samples outside the source islands.");
    }
}



