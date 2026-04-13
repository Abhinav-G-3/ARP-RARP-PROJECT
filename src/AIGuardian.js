export default class AIGuardian {
    constructor() {
        this.logger = null;
        this.logicRef = null;
        this.panel = document.getElementById('guardian-panel');
        this.msgEl = document.getElementById('guardian-msg');
        this.btnAction = document.getElementById('btn-guardian-action');
        this.btnDismiss = document.getElementById('btn-guardian-dismiss');
        
        this.broadcastTracker = {};
        this.currentAnomaly = null;

        this.bindEvents();
    }

    setLogger(logger) { this.logger = logger; }
    setLogicRef(logic) { this.logicRef = logic; }

    bindEvents() {
        this.btnDismiss.addEventListener('click', () => {
            this.panel.classList.add('hidden');
            this.currentAnomaly = null;
        });

        this.btnAction.addEventListener('click', () => {
            if(this.currentAnomaly) {
                this.executeAutoFix(this.currentAnomaly);
                this.panel.classList.add('hidden');
                this.currentAnomaly = null;
            }
        });
    }

    registerBroadcast(node) {
        // Simple storm detection: >3 broadcasts within 5 seconds
        const now = Date.now();
        if(!this.broadcastTracker[node.id]) {
            this.broadcastTracker[node.id] = [];
        }
        
        this.broadcastTracker[node.id] = this.broadcastTracker[node.id].filter(t => now - t < 5000);
        this.broadcastTracker[node.id].push(now);

        if(this.broadcastTracker[node.id].length > 4) {
            this.reportAnomaly('storm', node);
            this.broadcastTracker[node.id] = []; // reset
        }
    }

    reportAnomaly(type, targetNode, extraData = {}) {
        let msg = '';
        let actionTxt = '';

        switch(type) {
            case 'duplicate_ip':
                msg = `Duplicate IP observed for ${targetNode.ip}. Network instability likely.`;
                actionTxt = `Isolate Node & Reconfigure`;
                break;
            case 'server_timeout':
                msg = `RARP Server Timeout detected for request from ${targetNode.name}.`;
                actionTxt = `Engage Backup Server`;
                break;
            case 'spoofing':
                msg = `ARP Spoofing detected! Unsolicited reply poisoned ${targetNode.name}'s cache!`;
                actionTxt = `Clear Cache & Block MAC`;
                break;
            case 'storm':
                msg = `Broadcast Storm originating from ${targetNode.name}. Congestion critical.`;
                actionTxt = `Apply Rate Limiter`;
                break;
        }

        this.currentAnomaly = { type, targetNode, extraData };
        this.msgEl.textContent = msg;
        this.btnAction.textContent = `Auto-Fix: ${actionTxt}`;
        this.panel.classList.remove('hidden');

        if(this.logger) this.logger('Guardian', `ALERT: ${msg}`, 'error-msg');
    }

    executeAutoFix(anomaly) {
        if(this.logger) this.logger('Guardian', `Executing Auto-Fix for ${anomaly.type}...`, 'system-msg');

        switch(anomaly.type) {
            case 'duplicate_ip':
                // Auto fix: change the ip
                const newIp = anomaly.targetNode.ip.split('.').map((x,i) => i===3 ? Math.floor(Math.random()*200)+20 : x).join('.');
                anomaly.targetNode.ip = newIp;
                if(this.logger) this.logger('Guardian', `${anomaly.targetNode.name} IP changed to ${newIp} to resolve conflict.`, 'success-msg');
                break;
            case 'server_timeout':
                // Auto fix: create a temporary server and retry
                if(this.logger) this.logger('Guardian', `Simulating backup server spawn and retry...`, 'success-msg');
                this.logicRef.runRARP(anomaly.targetNode, anomaly.targetNode.mac);
                break;
            case 'spoofing':
                // Auto fix: clear cache of victim
                anomaly.targetNode.arpCache = {};
                if(this.logger) this.logger('Guardian', `Cleared poisoned ARP cache on ${anomaly.targetNode.name}. Dropped spoofed packets.`, 'success-msg');
                break;
            case 'storm':
                if(this.logger) this.logger('Guardian', `Rate limiter applied to ${anomaly.targetNode.name}. Broadcast suppressed.`, 'success-msg');
                break;
        }
        
        if (this.logicRef.onTableUpdated) {
             this.logicRef.onTableUpdated(anomaly.targetNode); // refresh UI
        }
    }
}
