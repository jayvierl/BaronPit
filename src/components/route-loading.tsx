import styles from "./route-loading.module.css";

export function RouteLoading({ label }: { label: string }) {
  return <div className={styles.loading} role="status">
    <span>{label}</span>
    <div className={styles.row} aria-hidden="true"><i/><i/></div>
    <div className={styles.row} aria-hidden="true"><i/><i/></div>
  </div>;
}
