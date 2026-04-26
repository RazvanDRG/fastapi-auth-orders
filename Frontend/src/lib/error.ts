export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong."
): string {
  const error = err as any;
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.msg) return item.msg;
        return JSON.stringify(item);
      })
      .join(", ");
  }

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  if (error?.message === "Network Error") {
    return "Network error. Please check if the backend is running.";
  }

  return fallback;
}