const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'in', 'on', 'at', 'to',
  'for', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our',
  'their', 'me', 'him', 'them', 'us', 'who', 'what', 'when', 'where', 'why',
  'how', 'not', 'no', 'yes', 'so', 'than', 'then', 'too', 'very', 'just',
]);

export interface TermStat {
  term: string;
  tf: number;
  idf: number;
  tfidf: number;
}

export class TfIdf {
  private docs: Map<string, number>[] = [];
  private docFreq: Map<string, number> = new Map();

  addDocument(text: string): void {
    const tokens = tokenize(text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    this.docs.push(tf);
    for (const t of tf.keys()) {
      this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
    }
  }

  get documentCount(): number {
    return this.docs.length;
  }

  tfidf(term: string, docIndex: number): number {
    const doc = this.docs[docIndex];
    if (!doc) return 0;
    const tf = doc.get(term) ?? 0;
    if (tf === 0) return 0;
    const df = this.docFreq.get(term) ?? 0;
    const idf = Math.log(this.docs.length / (1 + df)) + 1;
    return tf * idf;
  }

  listTerms(docIndex: number): TermStat[] {
    const doc = this.docs[docIndex];
    if (!doc) return [];
    const out: TermStat[] = [];
    for (const [term, tf] of doc) {
      const df = this.docFreq.get(term) ?? 0;
      const idf = Math.log(this.docs.length / (1 + df)) + 1;
      out.push({ term, tf, idf, tfidf: tf * idf });
    }
    out.sort((a, b) => b.tfidf - a.tfidf);
    return out;
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}
