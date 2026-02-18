import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Timer,
  Server,
  Clock,
  Play,
  BarChart3,
  BookOpen,
  Code2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Upload,
  FileSpreadsheet,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  Cell,
} from "recharts";
import { runSimulation, runSimulationFromDataset, parseCSV, type SimulationParams, type SimulationResult, type DatasetRow } from "@/lib/simulation";

const STEPS = [
  {
    step: 1,
    title: "Definisi Model M/M/c",
    desc: "Tentukan parameter model antrian: tingkat kedatangan (λ), tingkat pelayanan (μ), dan jumlah server (c).",
  },
  {
    step: 2,
    title: "Identifikasi Variabel Tak Tentu",
    desc: "Inter-Arrival Time (IAT) dan Service Time (ST) diidentifikasi sebagai variabel yang tidak pasti.",
  },
  {
    step: 3,
    title: "Pemetaan Distribusi",
    desc: "IAT dan ST dipetakan ke Distribusi Eksponensial sesuai teori antrian.",
  },
  {
    step: 4,
    title: "Pembangkitan PRNG",
    desc: "Bangkitkan bilangan acak semu R ∈ [0, 1] menggunakan Pseudo-Random Number Generator.",
  },
  {
    step: 5,
    title: "Iterasi Simulasi",
    desc: "Jalankan loop simulasi untuk setiap pelanggan selama durasi yang ditentukan menggunakan Inverse Transform Sampling.",
  },
  {
    step: 6,
    title: "Analisis Hasil",
    desc: "Hitung metrik: Rata-rata Waktu Tunggu, Utilisasi Server, dan Panjang Antrian.",
  },
];

const PSEUDOCODE = `ALGORITMA Simulasi Monte Carlo M/M/c

INPUT:
  λ ← Tingkat kedatangan (pelanggan/menit)
  μ ← Tingkat pelayanan (pelanggan/menit/server)
  c ← Jumlah server (kasir)
  D ← Durasi simulasi (menit)

INISIALISASI:
  serverFinishTime[1..c] ← 0
  currentTime ← 0
  customerID ← 0
  results ← []

PROSES:
  WHILE currentTime < D DO
    customerID ← customerID + 1

    // Langkah 4: Bangkitkan bilangan acak
    R_iat ← RANDOM(0, 1)
    R_st  ← RANDOM(0, 1)

    // Langkah 5: Inverse Transform Sampling
    IF customerID = 1 THEN
      IAT ← 0
    ELSE
      IAT ← -ln(R_iat) / λ
    END IF
    ST ← -ln(R_st) / μ

    currentTime ← currentTime + IAT
    IF currentTime ≥ D THEN BREAK

    // Multi-server: Cari server tercepat
    minFinish ← MIN(serverFinishTime[1..c])
    serverIdx ← INDEX_OF(minFinish)

    // Hitung waktu tunggu
    startService ← MAX(currentTime, serverFinishTime[serverIdx])
    waitTime ← startService - currentTime
    endService ← startService + ST

    serverFinishTime[serverIdx] ← endService

    SIMPAN hasil pelanggan ke results

  END WHILE

OUTPUT (Langkah 6):
  avgWait ← MEAN(waitTime dari semua pelanggan)
  utilization ← SUM(serviceTime) / (c × D) × 100%
  avgQueueLen ← λ × avgWait`;

function GaugeChart({ value, label }: { value: number; label: string }) {
  const color = value > 90 ? "hsl(0, 75%, 50%)" : value > 70 ? "hsl(38, 92%, 50%)" : "hsl(142, 70%, 40%)";
  const data = [{ name: label, value, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={200} height={200}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="90%"
          barSize={16}
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={8}
            background={{ fill: "hsl(40, 15%, 92%)" }}
          >
            <Cell fill={color} />
          </RadialBar>
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="-mt-20 text-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {value.toFixed(1)}%
        </span>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  status,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit: string;
  status?: "good" | "warning" | "danger";
}) {
  const statusColors = {
    good: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
  };

  return (
    <Card className="shadow-brand">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`p-3 rounded-xl ${status ? statusColors[status] : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">
            {value} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SimulationApp() {
  const [paramsA, setParamsA] = useState<SimulationParams>({
    arrivalRate: 2,
    serviceRate: 0.8,
    numServers: 2,
    duration: 480,
  });
  const [paramsB, setParamsB] = useState<SimulationParams>({
    arrivalRate: 2,
    serviceRate: 0.8,
    numServers: 4,
    duration: 480,
  });

  const [resultA, setResultA] = useState<SimulationResult | null>(null);
  const [resultB, setResultB] = useState<SimulationResult | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  const [datasetA, setDatasetA] = useState<DatasetRow[] | null>(null);
  const [datasetB, setDatasetB] = useState<DatasetRow[] | null>(null);
  const [datasetFileNameA, setDatasetFileNameA] = useState("");
  const [datasetFileNameB, setDatasetFileNameB] = useState("");
  const fileInputRefA = useRef<HTMLInputElement>(null);
  const fileInputRefB = useRef<HTMLInputElement>(null);

  const handleFileUpload = (file: File, scenario: "A" | "B") => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) return;
      if (scenario === "A") {
        setDatasetA(rows);
        setDatasetFileNameA(file.name);
      } else {
        setDatasetB(rows);
        setDatasetFileNameB(file.name);
      }
    };
    reader.readAsText(file);
  };

  const runBothSimulations = useCallback(() => {
    setResultA(datasetA ? runSimulationFromDataset(datasetA, paramsA.numServers) : runSimulation(paramsA));
    setResultB(datasetB ? runSimulationFromDataset(datasetB, paramsB.numServers) : runSimulation(paramsB));
    setActiveTab("results");
  }, [paramsA, paramsB, datasetA, datasetB]);

  const getWaitStatus = (val: number) => (val > 10 ? "danger" : val > 5 ? "warning" : "good");
  const getUtilStatus = (val: number) => (val > 90 ? "danger" : val > 70 ? "warning" : "good");

  const comparisonData =
    resultA && resultB
      ? [
          { metric: "Rata-rata Tunggu (min)", "Skenario A": +resultA.avgWaitTime.toFixed(2), "Skenario B": +resultB.avgWaitTime.toFixed(2) },
          { metric: "Maks Tunggu (min)", "Skenario A": +resultA.maxWaitTime.toFixed(2), "Skenario B": +resultB.maxWaitTime.toFixed(2) },
          { metric: "Panjang Antrian", "Skenario A": +resultA.avgQueueLength.toFixed(2), "Skenario B": +resultB.avgQueueLength.toFixed(2) },
        ]
      : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-hero text-primary-foreground py-6 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Zap className="h-8 w-8 text-secondary" />
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Simulasi Monte Carlo — Optimasi Antrian McDonald's
            </h1>
          </div>
          <p className="text-primary-foreground/70 text-sm md:text-base ml-11">
            Model M/M/c · Analisis Lonjakan BTS Meal · Inverse Transform Sampling
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 bg-muted">
            <TabsTrigger value="dashboard" className="gap-2 text-xs md:text-sm">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-2 text-xs md:text-sm">
              <TrendingUp className="h-4 w-4" /> Hasil
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-2 text-xs md:text-sm">
              <Users className="h-4 w-4" /> Tabel
            </TabsTrigger>
            <TabsTrigger value="steps" className="gap-2 text-xs md:text-sm">
              <BookOpen className="h-4 w-4" /> 6 Langkah
            </TabsTrigger>
            <TabsTrigger value="algorithm" className="gap-2 text-xs md:text-sm">
              <Code2 className="h-4 w-4" /> Algoritma
            </TabsTrigger>
          </TabsList>

          {/* === DASHBOARD TAB === */}
          <TabsContent value="dashboard" className="space-y-6 mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Skenario A */}
              <Card className="border-danger/30 shadow-brand">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Badge className="bg-danger text-danger-foreground">A</Badge>
                    Skenario A — Lonjakan (Surge)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DatasetUpload
                    fileName={datasetFileNameA}
                    rowCount={datasetA?.length ?? 0}
                    onUpload={(file) => handleFileUpload(file, "A")}
                    onClear={() => { setDatasetA(null); setDatasetFileNameA(""); }}
                    inputRef={fileInputRefA}
                  />
                  {!datasetA && (
                    <>
                      <ParamInput label="Tingkat Kedatangan (λ)" unit="pelanggan/menit" value={paramsA.arrivalRate} onChange={(v) => setParamsA({ ...paramsA, arrivalRate: v })} />
                      <ParamInput label="Tingkat Pelayanan (μ)" unit="pelanggan/menit" value={paramsA.serviceRate} onChange={(v) => setParamsA({ ...paramsA, serviceRate: v })} />
                      <ParamInput label="Durasi Simulasi" unit="menit" value={paramsA.duration} onChange={(v) => setParamsA({ ...paramsA, duration: Math.max(1, Math.round(v)) })} />
                    </>
                  )}
                  <ParamInput label="Jumlah Server (c)" unit="kasir" value={paramsA.numServers} onChange={(v) => setParamsA({ ...paramsA, numServers: Math.max(1, Math.round(v)) })} />
                </CardContent>
              </Card>

              {/* Skenario B */}
              <Card className="border-success/30 shadow-brand">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Badge className="bg-success text-success-foreground">B</Badge>
                    Skenario B — Optimal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DatasetUpload
                    fileName={datasetFileNameB}
                    rowCount={datasetB?.length ?? 0}
                    onUpload={(file) => handleFileUpload(file, "B")}
                    onClear={() => { setDatasetB(null); setDatasetFileNameB(""); }}
                    inputRef={fileInputRefB}
                  />
                  {!datasetB && (
                    <>
                      <ParamInput label="Tingkat Kedatangan (λ)" unit="pelanggan/menit" value={paramsB.arrivalRate} onChange={(v) => setParamsB({ ...paramsB, arrivalRate: v })} />
                      <ParamInput label="Tingkat Pelayanan (μ)" unit="pelanggan/menit" value={paramsB.serviceRate} onChange={(v) => setParamsB({ ...paramsB, serviceRate: v })} />
                      <ParamInput label="Durasi Simulasi" unit="menit" value={paramsB.duration} onChange={(v) => setParamsB({ ...paramsB, duration: Math.max(1, Math.round(v)) })} />
                    </>
                  )}
                  <ParamInput label="Jumlah Server (c)" unit="kasir" value={paramsB.numServers} onChange={(v) => setParamsB({ ...paramsB, numServers: Math.max(1, Math.round(v)) })} />
                </CardContent>
              </Card>
            </div>

            <Button onClick={runBothSimulations} size="lg" className="w-full gradient-primary text-primary-foreground shadow-brand hover:opacity-90 text-lg font-semibold gap-2">
              <Play className="h-5 w-5" /> Jalankan Simulasi Monte Carlo
            </Button>
          </TabsContent>

          {/* === RESULTS TAB === */}
          <TabsContent value="results" className="space-y-6 mt-6">
            {!resultA || !resultB ? (
              <Card className="py-16 text-center">
                <CardContent>
                  <p className="text-muted-foreground text-lg">Jalankan simulasi terlebih dahulu dari tab Dashboard.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Metric Cards */}
                <div className="space-y-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-danger" /> Skenario A — {paramsA.numServers} Kasir (Surge)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard icon={Users} label="Total Pelanggan" value={resultA.totalCustomers.toString()} unit="orang" />
                    <MetricCard icon={Timer} label="Rata-rata Tunggu" value={resultA.avgWaitTime.toFixed(2)} unit="menit" status={getWaitStatus(resultA.avgWaitTime)} />
                    <MetricCard icon={Clock} label="Maks Tunggu" value={resultA.maxWaitTime.toFixed(2)} unit="menit" status={getWaitStatus(resultA.maxWaitTime)} />
                    <MetricCard icon={Server} label="Panjang Antrian" value={resultA.avgQueueLength.toFixed(2)} unit="orang" />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success" /> Skenario B — {paramsB.numServers} Kasir (Optimal)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard icon={Users} label="Total Pelanggan" value={resultB.totalCustomers.toString()} unit="orang" />
                    <MetricCard icon={Timer} label="Rata-rata Tunggu" value={resultB.avgWaitTime.toFixed(2)} unit="menit" status={getWaitStatus(resultB.avgWaitTime)} />
                    <MetricCard icon={Clock} label="Maks Tunggu" value={resultB.maxWaitTime.toFixed(2)} unit="menit" status={getWaitStatus(resultB.maxWaitTime)} />
                    <MetricCard icon={Server} label="Panjang Antrian" value={resultB.avgQueueLength.toFixed(2)} unit="orang" />
                  </div>
                </div>

                <Separator />

                {/* Charts */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="shadow-brand">
                    <CardHeader>
                      <CardTitle className="text-lg">Perbandingan Metrik</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={comparisonData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(40,15%,88%)" />
                          <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Skenario A" fill="hsl(0, 75%, 50%)" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="Skenario B" fill="hsl(142, 70%, 40%)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="shadow-brand">
                    <CardHeader>
                      <CardTitle className="text-lg">Utilisasi Server</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-around items-center">
                      <GaugeChart value={resultA.serverUtilization} label={`Skenario A (${paramsA.numServers} kasir)`} />
                      <GaugeChart value={resultB.serverUtilization} label={`Skenario B (${paramsB.numServers} kasir)`} />
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* === TABLE TAB === */}
          <TabsContent value="table" className="mt-6">
            {!resultA ? (
              <Card className="py-16 text-center">
                <CardContent>
                  <p className="text-muted-foreground text-lg">Jalankan simulasi terlebih dahulu.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <SimulationTable title={`Skenario A — ${paramsA.numServers} Kasir`} result={resultA} variant="danger" />
                <SimulationTable title={`Skenario B — ${paramsB.numServers} Kasir`} result={resultB!} variant="success" />
              </div>
            )}
          </TabsContent>

          {/* === 6 STEPS TAB === */}
          <TabsContent value="steps" className="mt-6">
            <Card className="shadow-brand">
              <CardHeader>
                <CardTitle className="text-xl">6 Langkah Metode Monte Carlo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {STEPS.map((s) => (
                    <div key={s.step} className="flex gap-4 p-4 rounded-xl bg-muted/50 border border-border hover:shadow-brand transition-shadow">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                        {s.step}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{s.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* === ALGORITHM TAB === */}
          <TabsContent value="algorithm" className="mt-6">
            <Card className="shadow-brand">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Code2 className="h-5 w-5" /> Pseudocode Algoritma Simulasi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-foreground text-background p-6 rounded-xl text-xs md:text-sm leading-relaxed overflow-x-auto font-mono whitespace-pre">
                  {PSEUDOCODE}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 text-center text-sm text-muted-foreground">
        Simulasi Monte Carlo M/M/c — Riset Operasi · Teori Antrian · Distribusi Eksponensial
      </footer>
    </div>
  );
}

function DatasetUpload({
  fileName,
  rowCount,
  onUpload,
  onClear,
  inputRef,
}: {
  fileName: string;
  rowCount: number;
  onUpload: (file: File) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium flex items-center gap-1">
        <FileSpreadsheet className="h-3.5 w-3.5" /> Dataset CSV <span className="text-muted-foreground">(opsional)</span>
      </Label>
      {fileName ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/60 border border-border text-sm">
          <FileSpreadsheet className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="truncate font-medium">{fileName}</span>
          <Badge variant="secondary" className="text-xs ml-auto flex-shrink-0">{rowCount} baris</Badge>
          <button onClick={onClear} className="text-muted-foreground hover:text-danger flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-sm text-muted-foreground"
        >
          <Upload className="h-4 w-4" />
          Upload CSV (kolom: IAT, Service Time)
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ParamInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label} <span className="text-muted-foreground">({unit})</span>
      </Label>
      <Input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-9"
      />
    </div>
  );
}

function SimulationTable({
  title,
  result,
  variant,
}: {
  title: string;
  result: SimulationResult;
  variant: "danger" | "success";
}) {
  const displayCustomers = result.customers.slice(0, 100);
  return (
    <Card className={`shadow-brand border-${variant}/30`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Badge className={variant === "danger" ? "bg-danger text-danger-foreground" : "bg-success text-success-foreground"}>
            {variant === "danger" ? "A" : "B"}
          </Badge>
          {title}
          <span className="text-muted-foreground font-normal text-sm">
            (menampilkan {displayCustomers.length} dari {result.totalCustomers} pelanggan)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">R (IAT)</th>
                <th className="p-2 text-left">R (ST)</th>
                <th className="p-2 text-left">IAT</th>
                <th className="p-2 text-left">Tiba</th>
                <th className="p-2 text-left">Tunggu</th>
                <th className="p-2 text-left">Mulai</th>
                <th className="p-2 text-left">Selesai</th>
                <th className="p-2 text-left">Server</th>
              </tr>
            </thead>
            <tbody>
              {displayCustomers.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/50">
                  <td className="p-2 font-mono">{c.id}</td>
                  <td className="p-2 font-mono">{c.randomIAT.toFixed(4)}</td>
                  <td className="p-2 font-mono">{c.randomST.toFixed(4)}</td>
                  <td className="p-2 font-mono">{c.interArrivalTime.toFixed(2)}</td>
                  <td className="p-2 font-mono">{c.arrivalTime.toFixed(2)}</td>
                  <td className={`p-2 font-mono font-semibold ${c.waitTime > 5 ? "text-danger" : "text-success"}`}>
                    {c.waitTime.toFixed(2)}
                  </td>
                  <td className="p-2 font-mono">{c.startServiceTime.toFixed(2)}</td>
                  <td className="p-2 font-mono">{c.endServiceTime.toFixed(2)}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-xs font-mono">
                      K{c.serverAssigned}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
