/** DD/MM/YYYY and DD/MM/YYYY HH:mm formatting via day.js */
import dayjs from "dayjs";

const FMT_DATE = "DD/MM/YYYY";
const FMT_DATETIME = "DD/MM/YYYY, h:mm A";
const FMT_TIME = "h:mm A";

export function formatDate(isoOrDate) {
  const d = dayjs(isoOrDate);
  return d.isValid() ? d.format(FMT_DATE) : String(isoOrDate);
}

export function formatDateTime(isoOrDate) {
  const d = dayjs(isoOrDate);
  return d.isValid() ? d.format(FMT_DATETIME) : String(isoOrDate);
}

/** Time only if today, otherwise full date-time (DD/MM/YYYY, HH:mm) */
export function formatNextRun(isoOrDate) {
  const d = dayjs(isoOrDate);
  if (!d.isValid()) return String(isoOrDate);
  return dayjs().isSame(d, "day") ? d.format(FMT_TIME) : d.format(FMT_DATETIME);
}
