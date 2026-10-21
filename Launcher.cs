using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace HajjiMohammadNabiAutos
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string backendDir = Path.Combine(baseDir, "backend");
                string logFile = Path.Combine(baseDir, "server.log");

                // 1. Check if server is already running on port 5000
                if (!IsPortListening(5000))
                {
                    // Check if node is installed
                    string nodePath = FindNodeExecutable(backendDir);
                    if (string.IsNullOrEmpty(nodePath))
                    {
                        DialogResult result = MessageBox.Show(
                            "Node.js is required to run the local server on this computer.\n\nWould you like to open the Node.js official download page?",
                            "Node.js Required - Hajji Mohammad Nabi Autos",
                            MessageBoxButtons.YesNo,
                            MessageBoxIcon.Information);

                        if (result == DialogResult.Yes)
                        {
                            Process.Start("https://nodejs.org/");
                        }
                        return;
                    }

                    // Start backend server in silent background process
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = nodePath;
                    psi.Arguments = "server.js";
                    psi.WorkingDirectory = backendDir;
                    psi.CreateNoWindow = true;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    psi.UseShellExecute = false;

                    try
                    {
                        Process.Start(psi);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Failed to start server: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }

                    // Dynamically wait until port 5000 is listening (up to 20 seconds)
                    int attempts = 0;
                    while (!IsPortListening(5000) && attempts < 40)
                    {
                        Thread.Sleep(300);
                        attempts++;
                    }
                }

                // 2. Launch in Native App Mode Window
                LaunchBrowserAppMode("http://localhost:5000");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Launcher Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static bool IsPortListening(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(300);
                    if (success && client.Connected)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        static string FindNodeExecutable(string backendDir)
        {
            // Check bundled node if any
            string localNode = Path.Combine(backendDir, "node.exe");
            if (File.Exists(localNode)) return localNode;

            // Check system PATH
            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            string[] paths = pathEnv.Split(';');
            foreach (string p in paths)
            {
                try
                {
                    if (string.IsNullOrEmpty(p.Trim())) continue;
                    string fullPath = Path.Combine(p.Trim(), "node.exe");
                    if (File.Exists(fullPath)) return fullPath;
                }
                catch { }
            }

            // Common default locations
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pfNode = Path.Combine(programFiles, "nodejs", "node.exe");
            if (File.Exists(pfNode)) return pfNode;

            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pfxNode = Path.Combine(programFilesX86, "nodejs", "node.exe");
            if (File.Exists(pfxNode)) return pfxNode;

            return null;
        }

        static void LaunchBrowserAppMode(string url)
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidateBrowsers = new string[]
            {
                Path.Combine(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
            };

            foreach (string browser in candidateBrowsers)
            {
                if (File.Exists(browser))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = browser;
                    psi.Arguments = string.Format("--app={0} --window-size=1366,820", url);
                    Process.Start(psi);
                    return;
                }
            }

            // Fallback to system default browser
            Process.Start(url);
        }
    }
}
