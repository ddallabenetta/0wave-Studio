import { redirect } from "next/navigation";

/** MVP: the product opens straight into the Studio. */
export default function Home() {
  redirect("/studio");
}
