--
-- PostgreSQL database dump
--

\restrict AhU91kHaNQjc7U9yTx3Hqq4EBEElEhRBu7Zy2yiz2LkXvGtP5ieUmJIEbknNqfq

-- Dumped from database version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: pgrouting; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgrouting WITH SCHEMA public;


--
-- Name: EXTENSION pgrouting; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgrouting IS 'pgRouting Extension';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accident_records_a2; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accident_records_a2 (
    accident_id integer NOT NULL,
    accident_date date,
    accident_type text,
    severity text,
    location_text text,
    longitude double precision,
    latitude double precision,
    geom public.geometry(Point,4326),
    nearest_road_id integer,
    distance_to_road_m double precision,
    accident_sub_type text,
    accident_main_type text,
    nearest_edge_id integer,
    distance_to_edge_m double precision
);


ALTER TABLE public.accident_records_a2 OWNER TO postgres;

--
-- Name: accident_records_accident_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accident_records_accident_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.accident_records_accident_id_seq OWNER TO postgres;

--
-- Name: accident_records_accident_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.accident_records_accident_id_seq OWNED BY public.accident_records_a2.accident_id;


--
-- Name: accident_records_a1; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accident_records_a1 (
    accident_id integer DEFAULT nextval('public.accident_records_accident_id_seq'::regclass) NOT NULL,
    accident_date date,
    accident_type text,
    severity text,
    location_text text,
    longitude double precision,
    latitude double precision,
    geom public.geometry(Point,4326),
    nearest_road_id integer,
    distance_to_road_m double precision,
    accident_sub_type text,
    accident_main_type text,
    nearest_edge_id integer,
    distance_to_edge_m double precision
);


ALTER TABLE public.accident_records_a1 OWNER TO postgres;

--
-- Name: accident_records_a1_guishan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accident_records_a1_guishan (
    accident_id integer,
    accident_date date,
    accident_type text,
    severity text,
    location_text text,
    longitude double precision,
    latitude double precision,
    geom public.geometry(Point,4326),
    nearest_road_id integer,
    distance_to_road_m double precision,
    accident_sub_type text,
    accident_main_type text,
    nearest_edge_id integer,
    distance_to_edge_m double precision
);


ALTER TABLE public.accident_records_a1_guishan OWNER TO postgres;

--
-- Name: accident_records_a2_guishan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accident_records_a2_guishan (
    accident_id integer,
    accident_date date,
    accident_type text,
    severity text,
    location_text text,
    longitude double precision,
    latitude double precision,
    geom public.geometry(Point,4326),
    nearest_road_id integer,
    distance_to_road_m double precision,
    accident_sub_type text,
    accident_main_type text,
    nearest_edge_id integer,
    distance_to_edge_m double precision
);


ALTER TABLE public.accident_records_a2_guishan OWNER TO postgres;

--
-- Name: accident_records_all_guishan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accident_records_all_guishan (
    nearest_edge_id integer,
    severity text
);


ALTER TABLE public.accident_records_all_guishan OWNER TO postgres;

--
-- Name: adminareas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.adminareas (
    ogc_fid integer NOT NULL,
    osm_id character varying(12),
    code numeric(4,0),
    fclass character varying(28),
    name character varying(100),
    geom public.geometry(MultiPolygon,4326)
);


ALTER TABLE public.adminareas OWNER TO postgres;

--
-- Name: adminareas_ogc_fid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.adminareas_ogc_fid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.adminareas_ogc_fid_seq OWNER TO postgres;

--
-- Name: adminareas_ogc_fid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.adminareas_ogc_fid_seq OWNED BY public.adminareas.ogc_fid;


--
-- Name: edge_risk_guishan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.edge_risk_guishan (
    edge_id integer,
    accident_count bigint,
    severity_score bigint,
    risk_score double precision,
    accident_density double precision
);


ALTER TABLE public.edge_risk_guishan OWNER TO postgres;

--
-- Name: road_edges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.road_edges (
    edge_id integer,
    name character varying(100),
    fclass character varying(28),
    oneway character varying(1),
    maxspeed numeric(3,0),
    bridge character varying(1),
    tunnel character varying(1),
    geom public.geometry(LineString,4326),
    length double precision,
    target integer,
    source integer
);


ALTER TABLE public.road_edges OWNER TO postgres;

--
-- Name: road_edges_guishan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.road_edges_guishan (
    edge_id integer,
    name character varying(100),
    fclass character varying(28),
    oneway character varying(1),
    maxspeed numeric(3,0),
    bridge character varying(1),
    tunnel character varying(1),
    geom public.geometry(LineString,4326),
    length double precision,
    target integer,
    reverse_cost double precision,
    cost double precision,
    source integer
);


ALTER TABLE public.road_edges_guishan OWNER TO postgres;

--
-- Name: road_edges_guishan_main; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.road_edges_guishan_main (
    edge_id integer,
    name character varying(100),
    fclass character varying(28),
    oneway character varying(1),
    maxspeed numeric(3,0),
    bridge character varying(1),
    tunnel character varying(1),
    geom public.geometry(LineString,4326),
    length double precision,
    target integer,
    reverse_cost double precision,
    cost double precision,
    source integer
);


ALTER TABLE public.road_edges_guishan_main OWNER TO postgres;

--
-- Name: road_edges_guishan_vertices_pgr; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.road_edges_guishan_vertices_pgr (
    id bigint NOT NULL,
    cnt integer,
    chk integer,
    ein integer,
    eout integer,
    the_geom public.geometry(Point,4326)
);


ALTER TABLE public.road_edges_guishan_vertices_pgr OWNER TO postgres;

--
-- Name: road_edges_guishan_vertices_pgr_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.road_edges_guishan_vertices_pgr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.road_edges_guishan_vertices_pgr_id_seq OWNER TO postgres;

--
-- Name: road_edges_guishan_vertices_pgr_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.road_edges_guishan_vertices_pgr_id_seq OWNED BY public.road_edges_guishan_vertices_pgr.id;


--
-- Name: road_edges_vertices_pgr; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.road_edges_vertices_pgr (
    id bigint NOT NULL,
    cnt integer,
    chk integer,
    ein integer,
    eout integer,
    the_geom public.geometry(Point,4326)
);


ALTER TABLE public.road_edges_vertices_pgr OWNER TO postgres;

--
-- Name: road_edges_vertices_pgr_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.road_edges_vertices_pgr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.road_edges_vertices_pgr_id_seq OWNER TO postgres;

--
-- Name: road_edges_vertices_pgr_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.road_edges_vertices_pgr_id_seq OWNED BY public.road_edges_vertices_pgr.id;


--
-- Name: roads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roads (
    ogc_fid integer NOT NULL,
    osm_id character varying(12),
    code numeric(4,0),
    fclass character varying(28),
    name character varying(100),
    ref character varying(20),
    oneway character varying(1),
    maxspeed numeric(3,0),
    layer numeric(12,0),
    bridge character varying(1),
    tunnel character varying(1),
    geom public.geometry(LineString,4326)
);


ALTER TABLE public.roads OWNER TO postgres;

--
-- Name: roads_guishan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roads_guishan (
    ogc_fid integer,
    osm_id character varying(12),
    code numeric(4,0),
    fclass character varying(28),
    name character varying(100),
    ref character varying(20),
    oneway character varying(1),
    maxspeed numeric(3,0),
    layer numeric(12,0),
    bridge character varying(1),
    tunnel character varying(1),
    geom public.geometry(LineString,4326)
);


ALTER TABLE public.roads_guishan OWNER TO postgres;

--
-- Name: roads_ogc_fid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.roads_ogc_fid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.roads_ogc_fid_seq OWNER TO postgres;

--
-- Name: roads_ogc_fid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.roads_ogc_fid_seq OWNED BY public.roads.ogc_fid;


--
-- Name: accident_records_a2 accident_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accident_records_a2 ALTER COLUMN accident_id SET DEFAULT nextval('public.accident_records_accident_id_seq'::regclass);


--
-- Name: adminareas ogc_fid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.adminareas ALTER COLUMN ogc_fid SET DEFAULT nextval('public.adminareas_ogc_fid_seq'::regclass);


--
-- Name: road_edges_guishan_vertices_pgr id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.road_edges_guishan_vertices_pgr ALTER COLUMN id SET DEFAULT nextval('public.road_edges_guishan_vertices_pgr_id_seq'::regclass);


--
-- Name: road_edges_vertices_pgr id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.road_edges_vertices_pgr ALTER COLUMN id SET DEFAULT nextval('public.road_edges_vertices_pgr_id_seq'::regclass);


--
-- Name: roads ogc_fid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roads ALTER COLUMN ogc_fid SET DEFAULT nextval('public.roads_ogc_fid_seq'::regclass);


--
-- Name: accident_records_a1 accident_records_a1_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accident_records_a1
    ADD CONSTRAINT accident_records_a1_pkey PRIMARY KEY (accident_id);


--
-- Name: accident_records_a2 accident_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accident_records_a2
    ADD CONSTRAINT accident_records_pkey PRIMARY KEY (accident_id);


--
-- Name: adminareas adminareas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.adminareas
    ADD CONSTRAINT adminareas_pkey PRIMARY KEY (ogc_fid);


--
-- Name: road_edges_guishan_vertices_pgr road_edges_guishan_vertices_pgr_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.road_edges_guishan_vertices_pgr
    ADD CONSTRAINT road_edges_guishan_vertices_pgr_pkey PRIMARY KEY (id);


--
-- Name: road_edges_vertices_pgr road_edges_vertices_pgr_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.road_edges_vertices_pgr
    ADD CONSTRAINT road_edges_vertices_pgr_pkey PRIMARY KEY (id);


--
-- Name: roads roads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roads
    ADD CONSTRAINT roads_pkey PRIMARY KEY (ogc_fid);


--
-- Name: adminareas_geom_geom_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX adminareas_geom_geom_idx ON public.adminareas USING gist (geom);


--
-- Name: road_edges_edge_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_edge_id_idx ON public.road_edges USING btree (edge_id);


--
-- Name: road_edges_geom_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_geom_idx ON public.road_edges USING gist (geom);


--
-- Name: road_edges_guishan_edge_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_guishan_edge_id_idx ON public.road_edges_guishan USING btree (edge_id);


--
-- Name: road_edges_guishan_geom_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_guishan_geom_idx ON public.road_edges_guishan USING gist (geom);


--
-- Name: road_edges_guishan_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_guishan_source_idx ON public.road_edges_guishan USING btree (source);


--
-- Name: road_edges_guishan_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_guishan_target_idx ON public.road_edges_guishan USING btree (target);


--
-- Name: road_edges_guishan_vertices_pgr_the_geom_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_guishan_vertices_pgr_the_geom_idx ON public.road_edges_guishan_vertices_pgr USING gist (the_geom);


--
-- Name: road_edges_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_source_idx ON public.road_edges USING btree (source);


--
-- Name: road_edges_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_target_idx ON public.road_edges USING btree (target);


--
-- Name: road_edges_vertices_pgr_the_geom_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX road_edges_vertices_pgr_the_geom_idx ON public.road_edges_vertices_pgr USING gist (the_geom);


--
-- Name: roads_geom_geom_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX roads_geom_geom_idx ON public.roads USING gist (geom);


--
-- PostgreSQL database dump complete
--

\unrestrict AhU91kHaNQjc7U9yTx3Hqq4EBEElEhRBu7Zy2yiz2LkXvGtP5ieUmJIEbknNqfq

