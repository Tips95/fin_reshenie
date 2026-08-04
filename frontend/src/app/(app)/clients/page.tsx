import { redirect } from "next/navigation";

export default function ClientsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string") params.set(key, value);
      else if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    }
  }
  const query = params.toString();
  redirect(query ? `/clients/contracts?${query}` : "/clients/contracts");
}
