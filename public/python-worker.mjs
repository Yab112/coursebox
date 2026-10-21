// Python (Pyodide) worker. A plain ES module served as-is, because Pyodide only runs in module workers and the
// app bundler turns its own workers into classic scripts. Message types: lib/python-protocol.ts.
//
// Behaves like a Jupyter kernel: one namespace per session, the last expression's value is shown (HTML for
// pandas and friends), matplotlib figures come back as PNGs, and imports of known packages (numpy, pandas,
// matplotlib...) are installed automatically before the code runs.

/** Executes a cell and reports its value, figures or a traceback trimmed to the user's own code. */
const HELPER = String.raw`
import ast, base64, io, os, sys, traceback
os.environ.setdefault("MPLBACKEND", "AGG")
os.makedirs("/home/pyodide/course", exist_ok=True)
os.chdir("/home/pyodide/course")

def __coursebox_run(src):
    ns = sys.modules["__main__"].__dict__
    out = {"images": []}
    try:
        tree = ast.parse(src, "<cell>", "exec")
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, "<cell>", "exec"), ns)
        if last is not None:
            val = eval(compile(last, "<cell>", "eval"), ns)
            if val is not None:
                ns["_"] = val
                html = getattr(val, "_repr_html_", None)
                if callable(html):
                    try:
                        out["html"] = html()
                    except Exception:
                        pass
                out["text"] = repr(val)
    except BaseException as e:
        te = traceback.TracebackException(type(e), e, e.__traceback__)
        te.stack = traceback.StackSummary.from_list([f for f in te.stack if f.filename != "<coursebox>"])
        out["error"] = "".join(te.format())
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is not None:
        for n in plt.get_fignums():
            buf = io.BytesIO()
            plt.figure(n).savefig(buf, format="png", bbox_inches="tight", dpi=110)
            out["images"].append(base64.b64encode(buf.getvalue()).decode())
        plt.close("all")
    return out
`;

let py;
let current = 0;
const post = (m) => self.postMessage(m);

async function init(indexURL, packageBaseUrl) {
  post({ type: "status", message: "Loading Python…" });
  const { loadPyodide } = await import(`${indexURL}pyodide.mjs`);
  py = await loadPyodide({ indexURL, packageBaseUrl });
  py.setStdout({ batched: (text) => post({ type: "stream", id: current, name: "stdout", text: text + "\n" }) });
  py.setStderr({ batched: (text) => post({ type: "stream", id: current, name: "stderr", text: text + "\n" }) });
  py.setStdin({ error: true });
  py.runPython(`exec(compile(${JSON.stringify(HELPER)}, "<coursebox>", "exec"))`);
  post({ type: "ready", version: py.version });
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === "init") return await init(m.indexURL, m.packageBaseUrl);
    if (!py) throw new Error("Python isn't loaded yet");
    if (m.type === "files") {
      for (const f of m.files) {
        const p = `/home/pyodide/course/${f.name}`;
        py.FS.mkdirTree(p.slice(0, p.lastIndexOf("/")));
        py.FS.writeFile(p, new Uint8Array(f.data));
      }
      return;
    }
    if (m.type === "run") {
      current = m.id;
      await py.loadPackagesFromImports(m.code, {
        messageCallback: (msg) => /^Loading|^Loaded/.test(msg) && post({ type: "status", message: msg.replace(/^Loaded /, "Installed ") }),
        errorCallback: (msg) => post({ type: "stream", id: m.id, name: "stderr", text: msg + "\n" }),
      });
      const res = py.globals.get("__coursebox_run")(m.code);
      const out = res.toJs({ dict_converter: Object.fromEntries });
      res.destroy();
      if (out.error) post({ type: "error", id: m.id, traceback: out.error });
      if (out.html || out.text || out.images.length) post({ type: "result", id: m.id, html: out.html, text: out.text, images: out.images });
      post({ type: "done", id: m.id });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (m.type === "run") {
      post({ type: "error", id: m.id, traceback: message });
      post({ type: "done", id: m.id });
    } else post({ type: "fatal", message });
  }
};
