// Konfigurasi Supabase Client
const SUPABASE_URL = "https://hwdgslgvhxillomzjwfb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZGdzbGd2aHhpbGxvbXpqd2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NjE4MDIsImV4cCI6MjEwOTIzNzgwMn0.pSk09tRBvJtzIPar2csYAjs15b5metdU-j58Ayu0oQE";

// Inisialisasi library Supabase (ditandai variabel global db)
const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
