import { redirect } from 'next/navigation';

// The dashboard lists every store; this keeps /stores working as a link target.
export default function Stores() {
  redirect('/');
}
