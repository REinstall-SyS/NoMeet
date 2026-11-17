export default function LoadingWorkspace() {
  return <main className="workspace-content skeleton-layout" aria-busy="true" aria-label="Loading workspace">
    <div className="skeleton skeleton-title" /><div className="split"><div className="skeleton skeleton-body" /><div className="skeleton skeleton-side" /></div>
  </main>;
}
