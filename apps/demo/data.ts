/**
 * Deterministic sample data for the demo site.
 *
 * Generated from fixed tables rather than random values, so a scrape run twice
 * produces the same rows and the demo stays reproducible.
 */

export interface Product {
  id: number;
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  oldPrice: number | null;
  rating: number;
  reviews: number;
  stock: number;
  tags: string[];
  colors: string[];
}

export interface Review {
  id: number;
  productId: number;
  author: string;
  authorHandle: string;
  rating: number;
  date: string;
  title: string;
  body: string;
  verified: boolean;
  helpful: number;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  type: string;
  salaryMin: number;
  salaryMax: number;
  posted: string;
  skills: string[];
  remote: boolean;
}

const ADJECTIVES = ["Aurora", "Basalt", "Cedar", "Delta", "Ember", "Flint", "Glacier", "Harbor"];
const NOUNS = ["Keyboard", "Monitor", "Headset", "Webcam", "Mouse", "Dock", "Lamp", "Stand"];
const BRANDS = ["Northwind", "Lumen", "Kestrel", "Orbit", "Vantage", "Pico"];
const CATEGORIES = ["Peripherals", "Displays", "Audio", "Accessories"];
const TAG_POOL = ["new", "sale", "bestseller", "limited", "refurbished", "eco"];
const COLOR_POOL = ["black", "white", "graphite", "sand", "navy"];

const pick = <T>(list: readonly T[], index: number): T => list[index % list.length] as T;

export const PRODUCTS: Product[] = Array.from({ length: 48 }, (_, i) => {
  const id = i + 1;
  const price = Math.round((19 + ((id * 37) % 480) + 0.99) * 100) / 100;
  // Every third product is discounted, so `oldPrice` is sometimes absent —
  // which is what makes an optional field worth demonstrating.
  const discounted = id % 3 === 0;

  return {
    id,
    sku: `SKU-${String(id).padStart(4, "0")}`,
    name: `${pick(ADJECTIVES, id)} ${pick(NOUNS, id * 3)} ${id}`,
    brand: pick(BRANDS, id * 2),
    category: pick(CATEGORIES, id),
    price,
    oldPrice: discounted ? Math.round(price * 1.35 * 100) / 100 : null,
    rating: Math.round((3 + ((id * 7) % 20) / 10) * 10) / 10,
    reviews: 4 + ((id * 13) % 240),
    stock: id % 7 === 0 ? 0 : 3 + ((id * 11) % 60),
    tags: TAG_POOL.filter((_, t) => (id + t) % 4 === 0).slice(0, 2),
    colors: COLOR_POOL.filter((_, c) => (id + c) % 3 === 0).slice(0, 3),
  };
});

const REVIEW_AUTHORS = ["Rina W.", "Budi S.", "Citra A.", "Dimas P.", "Eka M.", "Fajar N.", "Gita L.", "Hadi K."];
const REVIEW_TITLES = [
  "Exactly what I needed",
  "Good, with one caveat",
  "Better than the price suggests",
  "Solid build, average packaging",
  "Would buy again",
  "Does the job quietly",
];

export const REVIEWS: Review[] = Array.from({ length: 60 }, (_, i) => {
  const id = i + 1;
  const day = 1 + ((id * 11) % 28);
  const month = 1 + ((id * 5) % 12);
  return {
    id,
    productId: 1 + ((id * 7) % PRODUCTS.length),
    author: pick(REVIEW_AUTHORS, id),
    authorHandle: `user${100 + id}`,
    rating: 1 + ((id * 3) % 5),
    date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    title: pick(REVIEW_TITLES, id),
    body: `Used it daily for ${2 + (id % 10)} weeks. ${id % 2 === 0 ? "No complaints so far." : "Setup took a few minutes but it has been stable since."}`,
    verified: id % 3 !== 0,
    helpful: (id * 17) % 95,
  };
});

const JOB_TITLES = ["Data Engineer", "Backend Developer", "QA Analyst", "Product Designer", "DevOps Engineer", "Data Analyst"];
const COMPANIES = ["Nusantara Tech", "Pico Labs", "Orbit Systems", "Kestrel Digital", "Vantage Data"];
const CITIES = ["Jakarta", "Bandung", "Surabaya", "Yogyakarta", "Remote"];
const JOB_TYPES = ["Full-time", "Contract", "Internship"];
const SKILL_POOL = ["TypeScript", "Python", "SQL", "Docker", "React", "Kubernetes", "Airflow"];

export const JOBS: Job[] = Array.from({ length: 24 }, (_, i) => {
  const id = i + 1;
  const salaryMin = 8_000_000 + ((id * 1_700_000) % 22_000_000);
  return {
    id,
    title: pick(JOB_TITLES, id),
    company: pick(COMPANIES, id * 2),
    location: pick(CITIES, id * 3),
    type: pick(JOB_TYPES, id),
    salaryMin,
    salaryMax: salaryMin + 6_000_000,
    posted: `2026-0${1 + (id % 9)}-${String(1 + ((id * 3) % 28)).padStart(2, "0")}`,
    skills: SKILL_POOL.filter((_, s) => (id + s) % 3 === 0).slice(0, 3),
    remote: id % 4 === 0,
  };
});

export const PAGE_SIZE = 6;
export const TOTAL_PAGES = Math.ceil(PRODUCTS.length / PAGE_SIZE);

export const productsForPage = (page: number): Product[] =>
  PRODUCTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

export const formatIdr = (value: number): string => `Rp${value.toLocaleString("id-ID")}`;
export const formatUsd = (value: number): string => `$${value.toFixed(2)}`;
