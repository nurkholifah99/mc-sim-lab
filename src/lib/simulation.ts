// Monte Carlo M/M/c Simulation Engine
// Menggunakan Inverse Transform Sampling dengan Distribusi Eksponensial

export interface SimulationParams {
  arrivalRate: number;    // λ (lambda) - rata-rata kedatangan per menit
  serviceRate: number;    // μ (mu) - rata-rata pelayanan per menit per server
  numServers: number;     // c - jumlah kasir/server
  duration: number;       // durasi simulasi dalam menit
}

export interface CustomerRecord {
  id: number;
  randomIAT: number;      // R untuk IAT
  randomST: number;       // R untuk ST
  interArrivalTime: number;
  arrivalTime: number;
  serviceTime: number;
  waitTime: number;
  startServiceTime: number;
  endServiceTime: number;
  serverAssigned: number;
}

export interface SimulationResult {
  customers: CustomerRecord[];
  avgWaitTime: number;
  maxWaitTime: number;
  avgQueueLength: number;
  serverUtilization: number;
  totalCustomers: number;
  customersServed: number;
}

/**
 * Inverse Transform Sampling untuk Distribusi Eksponensial
 * t = -ln(R) / rate
 */
function exponentialRandom(rate: number): { random: number; value: number } {
  const R = Math.random();
  const value = -Math.log(R) / rate;
  return { random: R, value };
}

/**
 * Jalankan simulasi Monte Carlo M/M/c
 */
export function runSimulation(params: SimulationParams): SimulationResult {
  const { arrivalRate, serviceRate, numServers, duration } = params;

  const customers: CustomerRecord[] = [];
  const serverFinishTimes = new Array(numServers).fill(0);

  let currentTime = 0;
  let customerId = 0;

  while (currentTime < duration) {
    customerId++;

    // Generate Inter-Arrival Time menggunakan Inverse Transform
    const iat = exponentialRandom(arrivalRate);
    const interArrivalTime = customerId === 1 ? 0 : iat.value;
    currentTime += interArrivalTime;

    if (currentTime >= duration) break;

    // Generate Service Time menggunakan Inverse Transform
    const st = exponentialRandom(serviceRate);

    // Cari server yang paling cepat tersedia (Multi-server handling)
    const earliestFinish = Math.min(...serverFinishTimes);
    const serverIndex = serverFinishTimes.indexOf(earliestFinish);

    // Hitung waktu tunggu
    const startServiceTime = Math.max(currentTime, serverFinishTimes[serverIndex]);
    const waitTime = startServiceTime - currentTime;
    const endServiceTime = startServiceTime + st.value;

    // Update waktu selesai server
    serverFinishTimes[serverIndex] = endServiceTime;

    customers.push({
      id: customerId,
      randomIAT: iat.random,
      randomST: st.random,
      interArrivalTime: customerId === 1 ? 0 : interArrivalTime,
      arrivalTime: currentTime,
      serviceTime: st.value,
      waitTime,
      startServiceTime,
      endServiceTime,
      serverAssigned: serverIndex + 1,
    });
  }

  return computeResults(customers, numServers, duration, arrivalRate);
}

export interface DatasetRow {
  interArrivalTime: number;
  serviceTime: number;
}

/**
 * Parse CSV string ke array DatasetRow
 * Expects header row with columns containing "iat"/"inter" and "st"/"service"
 */
export function parseCSV(csvText: string): DatasetRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].toLowerCase().split(/[,;\t]/);
  
  // Auto-detect columns
  let iatCol = headers.findIndex(h => h.includes("iat") || h.includes("inter_arrival") || h.includes("interarrival") || h.includes("inter-arrival"));
  let stCol = headers.findIndex(h => h.includes("service") || h.includes("st") || h.includes("duration"));

  // Fallback: assume first two numeric columns
  if (iatCol === -1) iatCol = 0;
  if (stCol === -1) stCol = Math.min(1, headers.length - 1);

  const rows: DatasetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]/);
    const iat = parseFloat(cols[iatCol]);
    const st = parseFloat(cols[stCol]);
    if (!isNaN(iat) && !isNaN(st) && iat >= 0 && st > 0) {
      rows.push({ interArrivalTime: iat, serviceTime: st });
    }
  }
  return rows;
}

/**
 * Jalankan simulasi menggunakan dataset (bukan random generation)
 */
export function runSimulationFromDataset(
  dataset: DatasetRow[],
  numServers: number
): SimulationResult {
  const customers: CustomerRecord[] = [];
  const serverFinishTimes = new Array(numServers).fill(0);
  let currentTime = 0;

  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    const interArrivalTime = i === 0 ? 0 : row.interArrivalTime;
    currentTime += interArrivalTime;

    const earliestFinish = Math.min(...serverFinishTimes);
    const serverIndex = serverFinishTimes.indexOf(earliestFinish);

    const startServiceTime = Math.max(currentTime, serverFinishTimes[serverIndex]);
    const waitTime = startServiceTime - currentTime;
    const endServiceTime = startServiceTime + row.serviceTime;

    serverFinishTimes[serverIndex] = endServiceTime;

    customers.push({
      id: i + 1,
      randomIAT: 0,
      randomST: 0,
      interArrivalTime,
      arrivalTime: currentTime,
      serviceTime: row.serviceTime,
      waitTime,
      startServiceTime,
      endServiceTime,
      serverAssigned: serverIndex + 1,
    });
  }

  const duration = customers.length > 0 ? customers[customers.length - 1].endServiceTime : 0;
  const avgIAT = dataset.reduce((s, r) => s + r.interArrivalTime, 0) / dataset.length;
  const arrivalRate = avgIAT > 0 ? 1 / avgIAT : 1;

  return computeResults(customers, numServers, duration, arrivalRate);
}

function computeResults(
  customers: CustomerRecord[],
  numServers: number,
  duration: number,
  arrivalRate: number
): SimulationResult {
  const totalCustomers = customers.length;
  if (totalCustomers === 0) {
    return {
      customers: [],
      avgWaitTime: 0,
      maxWaitTime: 0,
      avgQueueLength: 0,
      serverUtilization: 0,
      totalCustomers: 0,
      customersServed: 0,
    };
  }

  const avgWaitTime = customers.reduce((sum, c) => sum + c.waitTime, 0) / totalCustomers;
  const maxWaitTime = Math.max(...customers.map(c => c.waitTime));
  const totalServiceTime = customers.reduce((sum, c) => sum + c.serviceTime, 0);
  const serverUtilization = duration > 0 ? (totalServiceTime / (numServers * duration)) * 100 : 0;
  const avgQueueLength = arrivalRate * avgWaitTime;

  return {
    customers,
    avgWaitTime,
    maxWaitTime,
    avgQueueLength,
    serverUtilization: Math.min(serverUtilization, 100),
    totalCustomers,
    customersServed: totalCustomers,
  };
}
