// Import useState hook from React to manage component state
import { useState } from 'react'; // React state hook for tracking async fetch data and loading status

// Root application component for TravelVerse scaffold
export default function App() { // declares and exports the default App component
  // State variable to store the JSON response string from the health check endpoint
  const [healthStatus, setHealthStatus] = useState<string>(''); // stores formatted JSON or error message to display in <pre>
  // State variable to track whether the API request is currently in progress
  const [isLoading, setIsLoading] = useState<boolean>(false); // controls button disabled state during fetch

  // Function to fetch API health status from the backend
  const checkHealth = async () => { // async event handler for the "Check API" button
    // Set loading state to true before initiating network request
    setIsLoading(true); // provides user feedback that the request is running
    // Wrap fetch in try-catch-finally block to handle network errors safely
    try { // starts error handling block
      // Send GET request to /api/health endpoint
      const response = await fetch('/api/health'); // calls the backend health check route
      // Parse the JSON response body
      const data: unknown = await response.json(); // parses JSON payload from response
      // Set the formatted JSON string into state with indentation
      const INDENT_SPACES = 2; // number of spaces for JSON formatting indentation
      setHealthStatus(JSON.stringify(data, null, INDENT_SPACES)); // sets formatted JSON string to healthStatus state
    } catch (error) { // catches any network or parsing exceptions
      // Update state with error message if request fails
      setHealthStatus(String(error)); // displays error in the preformatted box
    } finally { // cleanup block executed after try or catch
      // Reset loading indicator back to false
      setIsLoading(false); // re-enables the button for subsequent clicks
    } // ends try-catch-finally block
  }; // ends checkHealth function

  // Render the component interface
  return ( // returns the JSX tree for the minimal page
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6"> {/* main wrapper container */}
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center shadow-lg"> {/* card container */}
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">TravelVerse</h1> {/* application header */}
        <p className="text-slate-400 text-sm mb-6">Self-correcting travel agent - build in progress</p> {/* project status description */}
        <button // interactive trigger button
          type="button" // button element type specification
          onClick={checkHealth} // binds click handler to checkHealth function
          disabled={isLoading} // disables button while request is in flight
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md font-medium text-sm transition-colors cursor-pointer" // Tailwind styling
        > {/* button element body */}
          {isLoading ? 'Checking...' : 'Check API'} {/* displays dynamic label based on loading state */}
        </button> {/* closes button tag */}
        {healthStatus && ( // conditionally renders the pre element if healthStatus is non-empty
          <pre className="mt-4 w-full p-4 bg-slate-950 border border-slate-800 rounded-md text-left text-xs font-mono text-emerald-400 overflow-x-auto"> {/* preformatted text block */}
            {healthStatus} {/* renders JSON content */}
          </pre> // closes pre tag
        )} {/* ends conditional render */}
      </div> {/* closes card container */}
    </main> // closes main wrapper container
  ); // ends return statement
} // ends App function
