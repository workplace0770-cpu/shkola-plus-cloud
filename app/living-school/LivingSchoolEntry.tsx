import Link from "next/link";
import styles from "./living-school.module.css";

export default function LivingSchoolEntry() {
  return (
    <Link className={styles.entry} href="/living-school" aria-label="Открыть раздел Живая школа">
      <span aria-hidden="true">✦</span> Живая школа
    </Link>
  );
}
