import { PostCardLoading } from "@/components/post-card-loading";

import styles from "@/components/thread.module.css";

export default function LoadingThread() {
  return <div className={styles.threadPage}><PostCardLoading count={2}/></div>;
}
