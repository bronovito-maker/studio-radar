export default function LeadsLoading() {
  return (
    <section className="table-panel loading-table" aria-label="Caricamento lead">
      {Array.from({ length: 7 }, (_, index) => <div className="loading-row" key={index} />)}
    </section>
  );
}
