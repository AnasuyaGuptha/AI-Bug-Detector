import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="card mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={Compass}
        title="Page not found"
        action={
          <Link to="/" className="btn-secondary">
            <ArrowLeft className="size-4" aria-hidden />
            Back to scanner
          </Link>
        }
      >
        The link may be broken, or the page may have moved.
      </EmptyState>
    </div>
  )
}
