import Link from "next/link";
import { WardEmptyState } from "@/components/ward-mascot";

export default function MissingPage() {
  return <section data-page-unavailable>
    <WardEmptyState page text="The pit is quiet here." action={<Link href="/">Return home</Link>}/>
  </section>;
}
