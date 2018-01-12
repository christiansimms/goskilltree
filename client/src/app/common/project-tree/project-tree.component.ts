import {
  Component, ElementRef, EventEmitter, Input, OnInit, Output,
  ViewChild
} from '@angular/core';
import {ProjectTreeService} from "../project-tree.service";

declare let vis: any;
declare let jQuery: any;

// Note: we need the animation (caused by class "fade" below) or else it doesn't work on mobile 90% of the time.
@Component({
  selector: 'app-project-tree',
  template: `
    <div #projectTreeNetwork id="projectTreeNetworkId"></div>
  `,
  styles: [':host /deep/ .vis-network { border: 1px solid lightgray; }']
})
export class ProjectTreeComponent implements OnInit {

  @Input() playProjects: any;
  @Input() authorProjects: any;
  @Output() projectSelected = new EventEmitter();

  @ViewChild('projectTreeNetwork') containerElement: ElementRef;
  private network: any;

  constructor(private projectTreeService: ProjectTreeService) {
  }

  getDataToDisplay() {

    let nodes = [];
    let edges = [];

    // Only add node if not yet defined.
    let nodeIndex = {};

    let me = this;

    // Keep groupForProject return values in sync with group definitions.
    function groupForProject(name): string {
      if (me.projectTreeService.authorProjectIndex[name]) {
        // Project exists.
        if (me.projectTreeService.playProjectIndex[name]) {
          // And they're doing it.
          let project = me.projectTreeService.playProjectIndex[name];
          let userIsDone = project.current_step > project.total_steps;
          if (userIsDone) {
            return 'DoneGroup';
          } else {
            return 'InProgressGroup';
          }
        } else {
          // They haven't started it - can they now?
          if (me.projectTreeService.canStart(name)) {
            return 'CanStartGroup';
          } else {
            return 'CannotStartGroup';
          }
        }
      } else {
        // It does not exist.
        return 'NotExistGroup';
      }
    }

    function addNodeSafely(str) {
      if (nodeIndex[str]) {
        // Already defined.
      } else {
        let groupName = groupForProject(str);
        let data = {id: str, label: str, group: groupName};  // tooltip sucks on mobile: , title: 'This is a test title<br/>Line 2'};
        nodes.push(data);
        nodeIndex[str] = str;
      }
    }

    this.projectTreeService.getAllProjects().forEach(entry => {
      let parent = entry[0];
      let children = entry[1];
      addNodeSafely(parent);
      children.split(',').forEach(child => {
        child = child.trim();
        addNodeSafely(child);
        let color = 'Black';
        let data = {from: parent, to: child, color: color};
        edges.push(data);
      });
    }, /*thisArg=*/this);

    return {nodes: nodes, edges: edges};
  }

  ngOnInit() {
    let options = {
      width: '100%', // '600px',  // default is 100%, and you cannot set this in css styles above
      // height: '600px',  // ditto
      // clickToUse: true,  // you have to click on the canvas before it's active
      layout: {
        hierarchical: {
          levelSeparation: 200,
          direction: 'DU',
          sortMethod: 'directed'
        }
      },
      nodes: {
        shadow: true
      },
      edges: {
        arrows: {to: true},
        shadow: true,
        width: 1 // 2
      },
      interaction: {
        // tooltipDelay: 0,
        zoomView: true  // prevent user from zooming
      },
      // Keep groupForProject return values in sync with group definitions.
      groups: {
        CanStartGroup: {
          color: '#baf4be'  // light green
        },
        CannotStartGroup: {
          color: '#e5727a'  // light red
        },
        InProgressGroup: {
          color: '#baf4be'  // light green
        },
        DoneGroup: {
          color: 'LightBlue'
        },
        NotExistGroup: {
          color: 'LightGray'
        }
      }

    };

    this.network = new vis.Network(this.containerElement.nativeElement, this.getDataToDisplay(), options);
    this.smartAdjustCanvasHeight();

    // Handle click events.
    let me = this;
    this.network.on("click", function (params) {
      let nodes = params.nodes;
      if (nodes.length > 0) {
        // Assume just one clicked.
        let title = nodes[0];

        if (me.projectTreeService.playProjectIndex[title]) {
          me.projectSelected.emit({
            kind: 'PLAYPROJECT',
            project: me.projectTreeService.playProjectIndex[title]
          });
        } else if (me.projectTreeService.authorProjectIndex[title]) {
          me.projectSelected.emit({
            kind: 'AUTHORPROJECT',
            project: me.projectTreeService.authorProjectIndex[title]
          });
        } else {
          // Does not exist yet.
          me.projectSelected.emit({
            kind: 'DNE',
            project: {title: title}
          });
        }
      }
    });
    this.network.on("resize", function () {
      // console.log('RESIZE ME');
      me.smartAdjustCanvasHeight();
    });

  }

  smartAdjustCanvasHeight() {
    let fudgeFactor = 10;
    let height = window.innerHeight - this.containerElement.nativeElement.offsetTop - fudgeFactor;
    let heightPx = height + 'px';
    // console.log('DEBUG size: ', heightPx, ' -- ', window.innerHeight, this.containerElement.nativeElement.offsetTop);
    jQuery('canvas').height(heightPx);
    this.network.setSize();
  }

  redrawNodes() {
    this.network.fit({animation: true});
  }

}
