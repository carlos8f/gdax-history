<style>
	.demo {
		border:3px solid #000000;
		border-collapse:collapse;
		padding:5px;
	}
	.demo th {
		border:3px solid #000000;
		padding:5px;
		background:#F0F0F0;
	}
	.demo td {
		border:3px solid #000000;
		padding:5px;
		background:#DCC4FD;
	}
</style>
<script>
function sortTable(n) {
  var table, rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
  table = document.getElementById("demo");
  switching = true;
  //Set the sorting direction to ascending:
  dir = "asc"; 
  /*Make a loop that will continue until
  no switching has been done:*/
  while (switching) {
    //start by saying: no switching is done:
    switching = false;
    rows = table.getElementsByTagName("TR");
    /*Loop through all table rows (except the
    first, which contains table headers):*/
    for (i = 1; i < (rows.length - 1); i++) {
      //start by saying there should be no switching:
      shouldSwitch = false;
      /*Get the two elements you want to compare,
      one from current row and one from the next:*/
      x = rows[i].getElementsByTagName("TD")[n];
      y = rows[i + 1].getElementsByTagName("TD")[n];
      /*check if the two rows should switch place,
      based on the direction, asc or desc:*/
      if (dir == "asc") {
        if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
          //if so, mark as a switch and break the loop:
          shouldSwitch= true;
          break;
        }
      } else if (dir == "desc") {
        if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
          //if so, mark as a switch and break the loop:
          shouldSwitch= true;
          break;
        }
      }
    }
    if (shouldSwitch) {
      /*If a switch has been marked, make the switch
      and mark that a switch has been done:*/
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
      //Each time a switch is done, increase this count by 1:
      switchcount ++; 
    } else {
      /*If no switching has been done AND the direction is "asc",
      set the direction to "desc" and run the while loop again.*/
      if (switchcount == 0 && dir == "asc") {
        dir = "desc";
        switching = true;
      }
    }
  }
}
</script>
<?php
ini_set('max_execution_time', 0);
set_time_limit(20);
exec('ulimit -S -n 9999999999');
echo "Current Simulations for the next 24 hours.";
$path = ".";
$dh = opendir($path);
$i=1;
echo '<html><body><table class="demo" id="demo">\n\n';
echo '<tr>';
echo '<th onclick="sortTable(0)">Graph</th>';
echo '<th onclick="sortTable(1)">ROI</th>';
echo '</tr>';
while (($file = readdir($dh)) !== false) {
    if($file != "." && $file != ".." && $file != "index.php" && $file != ".htaccess" && $file != "error_log" && $file != "cgi-bin") {
    	if(fnmatch('*html', $file)) {
			$content = file($file);
			$searchfor = 'end balance:';
        
			// the following line prevents the browser from parsing this as HTML.

			// get the file contents, assuming the file to be readable (and exist)
			$contents = file_get_contents($file);
			// escape special characters in the query
			$pattern = preg_quote($searchfor, '/');
			// finalise the regular expression, matching the whole line
			$pattern = "/^.*$pattern.*\$/m";
			// search, and store all matching occurences in $matches
			if(preg_match_all($pattern, $contents, $matches)){
                echo "<tr><td><a href=$file>$file</a></td>";
                echo "<td>";
				echo implode("\n", $matches[0]);
            	echo "</td>";
            	echo "</tr>";
			}
			else{
			}
        }
    }
}
fclose($handle);
closedir($dh);
echo "</table></html>"
?> 
 
