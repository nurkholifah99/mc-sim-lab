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

  // Analisis hasil
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

  // Hitung utilisasi server
  const totalServiceTime = customers.reduce((sum, c) => sum + c.serviceTime, 0);
  const serverUtilization = (totalServiceTime / (numServers * duration)) * 100;

  // Estimasi rata-rata panjang antrian (menggunakan Little's Law approximation)
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
