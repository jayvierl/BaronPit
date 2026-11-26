import Link from "next/link";

export default function MissingPage() {
  return <section className="card" data-page-unavailable><h1 className="page-title">This page is unavailable</h1>
    <p>It may have moved, been removed, or be private to another player.</p>
    <Link href="/search">Search the community</Link></section>;
}
