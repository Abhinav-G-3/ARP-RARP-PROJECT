ARP & RARP PROTOCOL SIMULATION (Step-by-Step Implementation)

CONCEPT:

ARP (Address Resolution Protocol) is used to determine the MAC address of a device when its IP address is known.
RARP (Reverse Address Resolution Protocol) is used to determine the IP address of a device when its MAC address is known.
These protocols are essential for communication within a network, as they enable devices to identify each other correctly.


DESIGN LOGIC:

The project simulates a network environment by:
Creating multiple nodes (systems) with unique IP and MAC addresses
Connecting nodes using networking devices such as switches and routers
Performing RARP to obtain IP addresses from MAC addresses
Performing ARP between systems to obtain MAC addresses from IP addresses
Maintaining an ARP cache to store resolved mappings


STEP-BY-STEP IMPLEMENTATION:

Step 1: Deploy and Access

* Project is uploaded in GitHub
* Deploy using Vercel:
   * By clicking "visit" in Production Deployment
* Access the simulator through a web browser

Step 2: Create Network Nodes

* Enter required details such as:
  * IP Address
  * Subnet Mask
  * Default Gateway
  * MAC Address
* Click “Add Node” to create a device
* Nodes can also be generated randomly by directly clicking **“Add Node”** without manually entering details

Each node represents a system in the network.


Step 3: Configure Network Devices

* Select **“Is Router”** to create a router
* Select **“Is Switch”** to create a switch
This allows simulation of real network components.


Step 4: Establish Network Connections

* Select two nodes
* Click **“Connect Nodes”**
* Nodes get connected via switch/router
This forms the network topology.


Step 5: Perform RARP Operation

* Select a node with MAC address
* Since DHCP is not used in this project, IP addresses are assigned using RARP
* System sends RARP request
* Mapping table is searched
* Corresponding IP address is assigned
This simulates IP discovery using MAC address.


Step 6: Perform ARP Between Systems

* Choose sender and receiver nodes
* Sender knows receiver’s IP but not MAC
* ARP request is generated
* Receiver responds with MAC address
This establishes communication between nodes.


Step 7: Generate and Store ARP Cache

* After ARP response:
  * IP and MAC mapping is stored
  * This data is used for future communication
This improves efficiency by avoiding repeated requests.


Step 8: Monitor Network Activity

* All operations are displayed in the **Network Activity / Logs panel**
* One can access network activity by clicking on the respective system
* Logs include:
  * Node creation
  * Connections
  * ARP and RARP events
This helps in visualizing the protocol execution.




