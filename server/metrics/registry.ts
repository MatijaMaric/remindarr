type Labels = Record<string, string>;

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function labelsKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
    .join(",");
}

export class Counter {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
  ) {}

  inc(labels: Labels = {}, amount = 1): void {
    const key = labelsKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + amount);
  }

  reset(): void {
    this.values = new Map();
  }

  render(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [key, value] of this.values) {
        lines.push(`${this.name}${key ? `{${key}}` : ""} ${value}`);
      }
    }
    return lines.join("\n");
  }
}

export class Gauge {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
  ) {}

  set(labels: Labels = {}, value: number): void {
    this.values.set(labelsKey(labels), value);
  }

  reset(): void {
    this.values = new Map();
  }

  render(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [key, value] of this.values) {
        lines.push(`${this.name}${key ? `{${key}}` : ""} ${value}`);
      }
    }
    return lines.join("\n");
  }
}

// Default buckets for HTTP latency (seconds)
export const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// Tighter buckets for DB queries (seconds)
export const DB_BUCKETS = [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1];

interface HistogramEntry {
  counts: number[];
  sum: number;
  count: number;
}

export class Histogram {
  private data = new Map<string, HistogramEntry>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly buckets: number[] = DEFAULT_BUCKETS,
  ) {}

  observe(labels: Labels = {}, value: number): void {
    const key = labelsKey(labels);
    if (!this.data.has(key)) {
      this.data.set(key, {
        counts: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      });
    }
    const entry = this.data.get(key)!;
    // Counts are cumulative: each bucket counts all values <= its upper bound
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        entry.counts[i]++;
      }
    }
    entry.sum += value;
    entry.count++;
  }

  reset(): void {
    this.data = new Map();
  }

  render(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const [labelKey, entry] of this.data) {
      const prefix = labelKey ? `${labelKey},` : "";
      const suffix = labelKey ? `{${labelKey}}` : "";
      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(`${this.name}_bucket{${prefix}le="${this.buckets[i]}"} ${entry.counts[i]}`);
      }
      lines.push(`${this.name}_bucket{${prefix}le="+Inf"} ${entry.count}`);
      lines.push(`${this.name}_sum${suffix} ${entry.sum}`);
      lines.push(`${this.name}_count${suffix} ${entry.count}`);
    }
    return lines.join("\n");
  }
}
