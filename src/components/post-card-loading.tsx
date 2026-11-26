import styles from "./thread.module.css";

export function PostCardLoading({ count = 1, label = "Loading conversations" }: { count?: number; label?: string }) {
  return <div role="status" aria-label={label} aria-busy="true">
    {Array.from({ length: count }, (_, index) => <div className={styles.loadingPost} aria-hidden="true" key={index}>
      <span className={styles.loadingAvatar}/><div><span/><span/><span/></div>
    </div>)}
  </div>;
}
